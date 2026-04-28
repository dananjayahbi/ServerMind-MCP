"""Observable GUI-side state store."""

from __future__ import annotations

import threading
from typing import Any, Callable


class GUIState:
    """
    Central state store for the GUI. Thread-safe. Observers are notified on change.
    """

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._observers: dict[str, list[Callable[[Any], None]]] = {}

        # Backend connection state
        self.backend_available: bool = False
        # Session state from backend
        self.session_state: str = "DISCONNECTED"
        self.session_uuid: str | None = None
        self.profile_id: str | None = None
        self.commands_executed: int = 0
        self.connected_at: str | None = None
        # Profiles list
        self.profiles: list[dict] = []
        # Recent log entries
        self.recent_logs: list[dict] = []
        # Current panel
        self.current_panel: str = "dashboard"
        # Theme
        self.theme: str = "dark"

    # ------------------------------------------------------------------
    # Observer pattern
    # ------------------------------------------------------------------

    def subscribe(self, key: str, callback: Callable[[Any], None]) -> None:
        if key not in self._observers:
            self._observers[key] = []
        self._observers[key].append(callback)

    def _notify(self, key: str, value: Any) -> None:
        for cb in self._observers.get(key, []):
            try:
                cb(value)
            except Exception:
                pass

    # ------------------------------------------------------------------
    # Setters (thread-safe)
    # ------------------------------------------------------------------

    def set_backend_available(self, value: bool) -> None:
        with self._lock:
            if self.backend_available == value:
                return
            self.backend_available = value
        self._notify("backend_available", value)

    def update_session(self, state_dict: dict) -> None:
        with self._lock:
            self.session_state = state_dict.get("state", "DISCONNECTED")
            self.session_uuid = state_dict.get("session_uuid")
            self.profile_id = state_dict.get("profile_id")
            self.commands_executed = state_dict.get("commands_executed", 0)
            self.connected_at = state_dict.get("connected_at")
        self._notify("session", state_dict)

    def set_profiles(self, profiles: list[dict]) -> None:
        with self._lock:
            self.profiles = profiles
        self._notify("profiles", profiles)

    def append_log(self, entry: dict) -> None:
        with self._lock:
            self.recent_logs.append(entry)
            if len(self.recent_logs) > 5000:
                self.recent_logs = self.recent_logs[-4000:]
        self._notify("log_entry", entry)

    def set_logs(self, logs: list[dict]) -> None:
        with self._lock:
            self.recent_logs = logs
        self._notify("logs_reset", logs)

    def set_panel(self, panel: str) -> None:
        with self._lock:
            self.current_panel = panel
        self._notify("panel", panel)

    def set_theme(self, theme: str) -> None:
        with self._lock:
            self.theme = theme
        self._notify("theme", theme)
