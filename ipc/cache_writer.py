"""
MCP JSON cache writer.

Writes mcp_cache.json to the app data directory whenever profiles,
session state, or settings change. This allows the Next.js UI to
read the last-known state even when it starts before the MCP.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone

from config.paths import get_app_data_dir

logger = logging.getLogger(__name__)

_CACHE_VERSION = 1


def write_cache(
    profiles: list[dict] | None = None,
    session: dict | None = None,
    settings: dict | None = None,
) -> None:
    """Write the MCP cache JSON file. Accepts partial updates."""
    try:
        cache_path = get_app_data_dir() / "mcp_cache.json"

        # Load existing cache if present
        existing: dict = {}
        if cache_path.exists():
            try:
                existing = json.loads(cache_path.read_text(encoding="utf-8"))
            except Exception:
                existing = {}

        # Merge updates
        cache = {
            "version": _CACHE_VERSION,
            "last_updated": datetime.now(timezone.utc).isoformat(),
            "profiles": profiles if profiles is not None else existing.get("profiles", []),
            "session": session if session is not None else existing.get("session"),
            "settings": settings if settings is not None else existing.get("settings"),
        }

        cache_path.write_text(json.dumps(cache, indent=2), encoding="utf-8")
    except Exception as exc:
        logger.warning("Failed to write MCP cache: %s", exc)


def refresh_profiles_cache() -> None:
    """Re-read profiles from config engine and update cache."""
    try:
        from config.engine import get_engine
        profiles = [p.to_dict() for p in get_engine().list_profiles()]
        write_cache(profiles=profiles)
    except Exception as exc:
        logger.warning("Failed to refresh profiles cache: %s", exc)


def refresh_session_cache(session_dict: dict | None) -> None:
    """Update session state in cache."""
    write_cache(session=session_dict)


def refresh_settings_cache() -> None:
    """Re-read settings from config engine and update cache."""
    try:
        from config.engine import get_engine
        settings = get_engine().get_app_settings()
        write_cache(settings=settings)
    except Exception as exc:
        logger.warning("Failed to refresh settings cache: %s", exc)
