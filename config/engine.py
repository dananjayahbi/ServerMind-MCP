"""Configuration Engine — load, validate, save, and migrate server profiles."""

from __future__ import annotations

import json
import logging
import shutil
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

import jsonschema

from config.migrations import migrate
from config.paths import ensure_app_data_dir, get_config_path
from config.schema import CONFIG_SCHEMA, DEFAULT_APP_SETTINGS
from shared.constants import SCHEMA_VERSION
from shared.exceptions import (
    ConfigValidationError,
    ProfileInUseError,
    ProfileNotFoundError,
)
from shared.models import ServerProfile

logger = logging.getLogger(__name__)

_CHANGE_LISTENERS: list[Callable[[], None]] = []
_lock = threading.RLock()


def add_change_listener(fn: Callable[[], None]) -> None:
    with _lock:
        _CHANGE_LISTENERS.append(fn)


def _notify_change() -> None:
    for fn in list(_CHANGE_LISTENERS):
        try:
            fn()
        except Exception:
            logger.exception("Error in config change listener")


class ConfigEngine:
    """Manages the persistent configuration file."""

    def __init__(self) -> None:
        self._config: dict[str, Any] = self._default_config()
        self._path: Path = get_config_path()
        self._lock = threading.RLock()
        # Track active profile IDs to prevent deletion of in-use profiles
        self._active_profile_ids: set[str] = set()

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    def load(self) -> None:
        """Load and validate config from disk. Creates defaults if absent."""
        ensure_app_data_dir()
        with self._lock:
            if not self._path.exists():
                logger.info("No config file found; creating defaults at %s", self._path)
                self._config = self._default_config()
                self._save_unlocked()
                return

            try:
                raw = self._path.read_text(encoding="utf-8")
                data = json.loads(raw)
            except (OSError, json.JSONDecodeError) as exc:
                logger.error("Failed to read config file: %s. Using defaults.", exc)
                self._config = self._default_config()
                return

            # Migrate if needed
            if data.get("schema_version", 1) < SCHEMA_VERSION:
                backup = self._path.with_suffix(".json.bak")
                shutil.copy2(self._path, backup)
                logger.info("Backed up config to %s before migration", backup)
                data = migrate(data, SCHEMA_VERSION)

            violations = self._validate(data)
            if violations:
                logger.error(
                    "Config validation failed: %s. Loading safe defaults.", violations
                )
                self._config = self._default_config()
                return

            self._config = data
            logger.info("Configuration loaded from %s", self._path)

    def _validate(self, data: dict) -> list[str]:
        validator = jsonschema.Draft7Validator(CONFIG_SCHEMA)
        return [e.message for e in validator.iter_errors(data)]

    def _default_config(self) -> dict[str, Any]:
        return {
            "schema_version": SCHEMA_VERSION,
            "app_settings": dict(DEFAULT_APP_SETTINGS),
            "server_profiles": [],
        }

    def _save_unlocked(self) -> None:
        """Write config to disk (must hold _lock)."""
        self._path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self._path.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(self._config, indent=2), encoding="utf-8")
        tmp.replace(self._path)

    def save(self) -> None:
        with self._lock:
            self._save_unlocked()

    # ------------------------------------------------------------------
    # App Settings
    # ------------------------------------------------------------------

    def get_app_settings(self) -> dict[str, Any]:
        with self._lock:
            return dict(self._config.get("app_settings", DEFAULT_APP_SETTINGS))

    def update_app_settings(self, updates: dict[str, Any]) -> None:
        with self._lock:
            self._config.setdefault("app_settings", {}).update(updates)
            self._save_unlocked()
        _notify_change()

    # ------------------------------------------------------------------
    # Profile Operations
    # ------------------------------------------------------------------

    def list_profiles(self) -> list[ServerProfile]:
        with self._lock:
            return [
                ServerProfile.from_dict(p)
                for p in self._config.get("server_profiles", [])
            ]

    def get_profile(self, profile_id: str) -> ServerProfile:
        with self._lock:
            for p in self._config.get("server_profiles", []):
                if p["id"] == profile_id:
                    return ServerProfile.from_dict(p)
        raise ProfileNotFoundError(profile_id)

    def create_profile(self, profile: ServerProfile) -> ServerProfile:
        with self._lock:
            self._config.setdefault("server_profiles", []).append(profile.to_dict())
            self._save_unlocked()
        logger.info("Created server profile: %s (%s)", profile.display_name, profile.id)
        _notify_change()
        return profile

    def update_profile(self, profile: ServerProfile) -> ServerProfile:
        with self._lock:
            profiles = self._config.get("server_profiles", [])
            for i, p in enumerate(profiles):
                if p["id"] == profile.id:
                    profile.updated_at = datetime.now(timezone.utc).isoformat()
                    profiles[i] = profile.to_dict()
                    self._save_unlocked()
                    logger.info("Updated server profile: %s", profile.id)
                    _notify_change()
                    return profile
        raise ProfileNotFoundError(profile.id)

    def delete_profile(self, profile_id: str) -> None:
        with self._lock:
            if profile_id in self._active_profile_ids:
                raise ProfileInUseError(profile_id)
            profiles = self._config.get("server_profiles", [])
            new_profiles = [p for p in profiles if p["id"] != profile_id]
            if len(new_profiles) == len(profiles):
                raise ProfileNotFoundError(profile_id)
            self._config["server_profiles"] = new_profiles
            self._save_unlocked()
        logger.info("Deleted server profile: %s", profile_id)
        _notify_change()

    def reorder_profiles(self, ordered_ids: list[str]) -> None:
        with self._lock:
            profiles = {p["id"]: p for p in self._config.get("server_profiles", [])}
            new_order = [profiles[pid] for pid in ordered_ids if pid in profiles]
            # Append any profiles not in the ordered list at the end
            seen = set(ordered_ids)
            for p in self._config.get("server_profiles", []):
                if p["id"] not in seen:
                    new_order.append(p)
            self._config["server_profiles"] = new_order
            self._save_unlocked()
        _notify_change()

    # ------------------------------------------------------------------
    # Active Profile Tracking (called by SSH layer)
    # ------------------------------------------------------------------

    def mark_profile_active(self, profile_id: str) -> None:
        with self._lock:
            self._active_profile_ids.add(profile_id)

    def unmark_profile_active(self, profile_id: str) -> None:
        with self._lock:
            self._active_profile_ids.discard(profile_id)


# Module-level singleton
_engine: ConfigEngine | None = None


def get_engine() -> ConfigEngine:
    global _engine
    if _engine is None:
        _engine = ConfigEngine()
    return _engine
