"""Thread-safe session registry enforcing the single-EXPOSED-session constraint."""

from __future__ import annotations

import threading
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from shared.constants import SessionState
from shared.exceptions import SessionAlreadyExposedError
from shared.models import SessionStateModel


@dataclass
class SessionEntry:
    """Internal registry entry for an active session."""

    session_uuid: str
    profile_id: str
    state: str = SessionState.DISCONNECTED
    transport: Any = None          # paramiko.Transport
    shell_channel: Any = None      # paramiko.Channel (shell mode)
    connected_at: str | None = None
    last_keepalive_at: str | None = None
    reconnect_attempt_count: int = 0
    commands_executed: int = 0
    last_command_at: str | None = None
    _stop_keepalive: threading.Event = field(default_factory=threading.Event)
    _stop_reconnect: threading.Event = field(default_factory=threading.Event)

    def to_state_model(self) -> SessionStateModel:
        return SessionStateModel(
            state=self.state,
            session_uuid=self.session_uuid,
            profile_id=self.profile_id,
            connected_at=self.connected_at,
            last_keepalive_at=self.last_keepalive_at,
            reconnect_attempt_count=self.reconnect_attempt_count,
            commands_executed=self.commands_executed,
            last_command_at=self.last_command_at,
        )


class SessionRegistry:
    """
    Thread-safe registry for SSH sessions.
    Enforces the single-EXPOSED-session constraint.
    """

    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._sessions: dict[str, SessionEntry] = {}
        # profile_id -> session_uuid mapping for quick lookup
        self._profile_map: dict[str, str] = {}

    # ------------------------------------------------------------------
    # Session Management
    # ------------------------------------------------------------------

    def register(self, session_uuid: str, profile_id: str) -> SessionEntry:
        """Register a new session. Raises if another EXPOSED session exists."""
        with self._lock:
            # Check for existing exposed session
            for entry in self._sessions.values():
                if entry.state not in (SessionState.DISCONNECTED, SessionState.FAULT):
                    raise SessionAlreadyExposedError(
                        f"Session {entry.session_uuid} is already active "
                        f"(state: {entry.state}). Disconnect it first."
                    )

            entry = SessionEntry(
                session_uuid=session_uuid,
                profile_id=profile_id,
                state=SessionState.CONNECTING,
            )
            self._sessions[session_uuid] = entry
            self._profile_map[profile_id] = session_uuid
            return entry

    def get(self, session_uuid: str) -> SessionEntry | None:
        with self._lock:
            return self._sessions.get(session_uuid)

    def get_by_profile(self, profile_id: str) -> SessionEntry | None:
        with self._lock:
            sid = self._profile_map.get(profile_id)
            if sid:
                return self._sessions.get(sid)
            return None

    def get_active(self) -> SessionEntry | None:
        """Return the single active (non-DISCONNECTED) session, if any."""
        with self._lock:
            for entry in self._sessions.values():
                if entry.state not in (SessionState.DISCONNECTED,):
                    return entry
            return None

    def get_exposed(self) -> SessionEntry | None:
        """Return the CONNECTED session, if any."""
        with self._lock:
            for entry in self._sessions.values():
                if entry.state == SessionState.CONNECTED:
                    return entry
            return None

    def update_state(self, session_uuid: str, new_state: str) -> None:
        with self._lock:
            if session_uuid in self._sessions:
                self._sessions[session_uuid].state = new_state
                if new_state == SessionState.CONNECTED:
                    self._sessions[session_uuid].connected_at = (
                        datetime.now(timezone.utc).isoformat()
                    )

    def remove(self, session_uuid: str) -> None:
        with self._lock:
            entry = self._sessions.pop(session_uuid, None)
            if entry:
                self._profile_map.pop(entry.profile_id, None)

    def get_state_model(self) -> SessionStateModel:
        """Return a snapshot of the current session state (DISCONNECTED if none)."""
        with self._lock:
            for entry in self._sessions.values():
                if entry.state != SessionState.DISCONNECTED:
                    return entry.to_state_model()
            # Return a disconnected model
            return SessionStateModel()
