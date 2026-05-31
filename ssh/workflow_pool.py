"""SSH connection pool for workflow execution.

Manages multiple independent SSH sessions alongside (but separate from) the
MCP-exposed session controlled by SessionManager.  Unlike SessionManager there
is no single-session constraint here: each connect() call creates a new
entry in the pool and returns its session_uuid immediately while the TCP
handshake runs in a background thread.

Use-cases
---------
* Running workflows on multiple servers concurrently.
* Providing a dedicated terminal in the UI for each connected server.
"""

from __future__ import annotations

import logging
import threading
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Callable

from shared.constants import SessionState
from shared.models import CommandRequest, CommandResult, ServerProfile
from ssh.connection import establish_connection
from ssh.exec_channel import run_exec_command
from ssh.keepalive import KeepAliveEngine
from ssh.sftp_transfer import sftp_put_pipelined
from ssh.shell_channel import ShellChannel

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------

@dataclass
class PoolEntry:
    """Lightweight record for a single workflow connection."""

    session_uuid: str
    profile_id: str
    display_name: str
    hostname: str
    username: str
    state: str = SessionState.DISCONNECTED
    connected_at: str | None = None
    error: str | None = None

    def to_dict(self, is_mcp_session: bool = False) -> dict:
        return {
            "session_uuid": self.session_uuid,
            "profile_id": self.profile_id,
            "display_name": self.display_name,
            "hostname": self.hostname,
            "username": self.username,
            "state": self.state,
            "connected_at": self.connected_at,
            "error": self.error,
            "is_mcp_session": is_mcp_session,
        }


# ---------------------------------------------------------------------------
# Pool
# ---------------------------------------------------------------------------

class WorkflowConnectionPool:
    """Thread-safe pool of SSH connections for workflow execution."""

    def __init__(self) -> None:
        self._entries: dict[str, PoolEntry] = {}
        self._clients: dict[str, Any] = {}           # session_uuid -> paramiko.SSHClient
        self._profiles: dict[str, ServerProfile] = {}
        self._keepalive_engines: dict[str, KeepAliveEngine] = {}
        self._web_shells: dict[str, ShellChannel] = {}
        self._lock = threading.RLock()

    # ------------------------------------------------------------------
    # Connect
    # ------------------------------------------------------------------

    def connect(
        self,
        profile: ServerProfile,
        passphrase: str | None = None,
    ) -> str:
        """Initiate an async SSH connection.  Returns session_uuid immediately."""
        session_uuid = str(uuid.uuid4())
        entry = PoolEntry(
            session_uuid=session_uuid,
            profile_id=profile.id,
            display_name=profile.display_name,
            hostname=profile.hostname,
            username=profile.username,
            state=SessionState.CONNECTING,
        )
        with self._lock:
            self._entries[session_uuid] = entry
            self._profiles[session_uuid] = profile

        thread = threading.Thread(
            target=self._connect_bg,
            args=(session_uuid, profile, passphrase),
            name=f"wf-connect-{session_uuid[:8]}",
            daemon=True,
        )
        thread.start()
        return session_uuid

    def _connect_bg(
        self,
        session_uuid: str,
        profile: ServerProfile,
        passphrase: str | None,
    ) -> None:
        try:
            client = establish_connection(profile, passphrase)
        except Exception as exc:
            logger.error(
                "Workflow pool: connection failed for %s: %s", session_uuid, exc
            )
            with self._lock:
                entry = self._entries.get(session_uuid)
                if entry:
                    entry.state = SessionState.DISCONNECTED
                    entry.error = str(exc)
            return

        with self._lock:
            entry = self._entries.get(session_uuid)
            if not entry:
                # Was disconnected while we were connecting — clean up.
                client.close()
                return
            entry.state = SessionState.CONNECTED
            entry.connected_at = datetime.now(timezone.utc).isoformat()
            entry.error = None
            self._clients[session_uuid] = client

        engine = KeepAliveEngine(
            session_uuid=session_uuid,
            client=client,
            transport_interval_sec=profile.keepalive_transport_interval_sec,
            app_interval_sec=profile.keepalive_app_interval_sec,
            on_heartbeat=lambda ts: None,
            on_error=lambda sid, exc: self._on_keepalive_error(sid),
        )
        engine.start()
        with self._lock:
            self._keepalive_engines[session_uuid] = engine

        logger.info(
            "Workflow pool: session %s connected to %s@%s",
            session_uuid[:8],
            profile.username,
            profile.hostname,
        )

    def _on_keepalive_error(self, session_uuid: str) -> None:
        logger.warning(
            "Workflow pool: keepalive error for %s — marking FAULT", session_uuid[:8]
        )
        with self._lock:
            entry = self._entries.get(session_uuid)
            if entry:
                entry.state = SessionState.FAULT

    # ------------------------------------------------------------------
    # Disconnect
    # ------------------------------------------------------------------

    def disconnect(self, session_uuid: str) -> None:
        """Disconnect and remove a connection from the pool."""
        with self._lock:
            engine = self._keepalive_engines.pop(session_uuid, None)
            if engine:
                engine.stop()

            shell = self._web_shells.pop(session_uuid, None)
            if shell:
                shell.close()

            client = self._clients.pop(session_uuid, None)
            if client:
                try:
                    client.close()
                except Exception:
                    pass

            self._profiles.pop(session_uuid, None)
            self._entries.pop(session_uuid, None)

        logger.info("Workflow pool: session %s disconnected", session_uuid[:8])

    # ------------------------------------------------------------------
    # Introspection
    # ------------------------------------------------------------------

    def list_connections(self) -> list[dict]:
        """Return a serialisable snapshot of all pool entries."""
        with self._lock:
            return [e.to_dict() for e in self._entries.values()]

    def get_entry(self, session_uuid: str) -> PoolEntry | None:
        with self._lock:
            return self._entries.get(session_uuid)

    def get_client(self, session_uuid: str) -> Any | None:
        with self._lock:
            return self._clients.get(session_uuid)

    # ------------------------------------------------------------------
    # Command execution
    # ------------------------------------------------------------------

    def execute_command(
        self,
        session_uuid: str,
        request: CommandRequest,
    ) -> CommandResult:
        """Execute a command on a specific pooled session via exec mode."""
        client = self.get_client(session_uuid)
        if not client:
            return CommandResult(
                command_id=request.command_id,
                status="SESSION_UNAVAILABLE",
                stdout="",
                stderr=f"No connected client for session {session_uuid}",
            )
        profile = self._profiles.get(session_uuid)
        sudo_pw = profile.sudo_password or None if profile else None
        return run_exec_command(client, request, sudo_password=sudo_pw)

    # ------------------------------------------------------------------
    # File upload (SFTP pipelining)
    # ------------------------------------------------------------------

    def upload_file(
        self,
        session_uuid: str,
        local_path: str,
        remote_path: str,
        progress_callback: Callable[[int, int], None] | None = None,
    ) -> dict:
        """Upload a file to a pooled session using SFTP write pipelining."""
        import os

        client = self.get_client(session_uuid)
        if not client:
            return {
                "success": False,
                "error": f"No connected client for session {session_uuid}",
            }
        if not os.path.isfile(local_path):
            return {"success": False, "error": f"Local file not found: {local_path}"}

        try:
            sftp = client.open_sftp()
            try:
                # Resolve $HOME / ~ — SFTP does not expand shell variables.
                if "$HOME" in remote_path or remote_path.startswith("~"):
                    home_dir = sftp.normalize(".")
                    remote_path = remote_path.replace("$HOME", home_dir)
                    if remote_path.startswith("~/"):
                        remote_path = home_dir + "/" + remote_path[2:]
                    elif remote_path == "~":
                        remote_path = home_dir

                bytes_transferred = sftp_put_pipelined(
                    sftp,
                    local_path,
                    remote_path,
                    progress_callback=progress_callback,
                )
            finally:
                sftp.close()

            return {
                "success": True,
                "local_path": local_path,
                "remote_path": remote_path,
                "bytes_transferred": bytes_transferred,
            }
        except Exception as exc:
            return {"success": False, "error": str(exc)}

    # ------------------------------------------------------------------
    # Web shell (for xterm.js WebSocket terminal)
    # ------------------------------------------------------------------

    def get_or_open_web_shell(self, session_uuid: str) -> ShellChannel | None:
        """Get or open a dedicated PTY shell channel for the web terminal."""
        with self._lock:
            existing = self._web_shells.get(session_uuid)
            if existing and existing.is_open():
                return existing

            client = self._clients.get(session_uuid)
            if not client:
                return None

            shell = ShellChannel(client)
            shell.open(suppress_echo=False)
            self._web_shells[session_uuid] = shell

        return shell


# ---------------------------------------------------------------------------
# Module-level singleton
# ---------------------------------------------------------------------------

_pool: WorkflowConnectionPool | None = None
_pool_lock = threading.Lock()


def get_pool() -> WorkflowConnectionPool:
    global _pool
    if _pool is None:
        with _pool_lock:
            if _pool is None:
                _pool = WorkflowConnectionPool()
    return _pool
