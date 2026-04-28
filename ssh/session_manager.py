"""Top-level session lifecycle controller for ServerMind MCP."""

from __future__ import annotations

import logging
import threading
import uuid
from typing import Any, Callable

import audit.logger as audit_log
from shared.constants import Actor, EventCategory, LogLevel, SessionState
from shared.exceptions import (
    NoActiveSessionError,
    SessionAlreadyExposedError,
)
from shared.models import CommandRequest, CommandResult, ServerProfile, SessionStateModel
from ssh.connection import establish_connection
from ssh.exec_channel import run_exec_command
from ssh.keepalive import KeepAliveEngine
from ssh.reconnect import ReconnectPolicy
from ssh.session_registry import SessionRegistry
from ssh.shell_channel import ShellChannel

logger = logging.getLogger(__name__)

# Callbacks registered to receive session state changes
_state_change_callbacks: list[Callable[[SessionStateModel], None]] = []
_cb_lock = threading.Lock()


def add_state_change_callback(fn: Callable[[SessionStateModel], None]) -> None:
    with _cb_lock:
        _state_change_callbacks.append(fn)


def _notify_state_change(registry: SessionRegistry) -> None:
    model = registry.get_state_model()
    with _cb_lock:
        for fn in list(_state_change_callbacks):
            try:
                fn(model)
            except Exception:
                logger.exception("Error in state change callback")


class SessionManager:
    """Manages the full lifecycle of SSH sessions."""

    def __init__(self) -> None:
        self._registry = SessionRegistry()
        self._keepalive_engines: dict[str, KeepAliveEngine] = {}
        self._reconnect_policies: dict[str, ReconnectPolicy] = {}
        self._shell_channels: dict[str, ShellChannel] = {}
        self._lock = threading.RLock()
        # Map session_uuid -> paramiko client
        self._clients: dict[str, Any] = {}
        # Terminal output callback: (session_uuid, command_id, chunk, stream) -> None
        self._terminal_output_callback: Callable[[str, str, str, str], None] | None = None

    def set_terminal_output_callback(
        self, fn: Callable[[str, str, str, str], None]
    ) -> None:
        self._terminal_output_callback = fn

    # ------------------------------------------------------------------
    # Expose / Connect
    # ------------------------------------------------------------------

    def expose(
        self,
        profile: ServerProfile,
        passphrase: str | None = None,
    ) -> str:
        """
        Initiate an SSH connection for the given profile.
        Returns the session_uuid. Connection happens asynchronously.
        """
        session_uuid = str(uuid.uuid4())

        with self._lock:
            # Will raise SessionAlreadyExposedError if another is active
            entry = self._registry.register(session_uuid, profile.id)

        audit_log.info(
            EventCategory.CONNECTION,
            f"Initiating SSH connection to {profile.hostname}:{profile.port}",
            actor=Actor.OPERATOR,
            profile_id=profile.id,
            session_uuid=session_uuid,
        )

        _notify_state_change(self._registry)

        # Connect in background thread
        thread = threading.Thread(
            target=self._connect_background,
            args=(session_uuid, profile, passphrase),
            name=f"ssh-connect-{session_uuid[:8]}",
            daemon=True,
        )
        thread.start()

        return session_uuid

    def _connect_background(
        self,
        session_uuid: str,
        profile: ServerProfile,
        passphrase: str | None,
    ) -> None:
        try:
            client = establish_connection(profile, passphrase)
        except Exception as exc:
            logger.error("Connection failed for session %s: %s", session_uuid, exc)
            audit_log.error(
                EventCategory.CONNECTION,
                f"SSH connection failed: {exc}",
                profile_id=profile.id,
                session_uuid=session_uuid,
            )
            self._registry.update_state(session_uuid, SessionState.DISCONNECTED)
            _notify_state_change(self._registry)
            return

        with self._lock:
            self._clients[session_uuid] = client
            self._registry.update_state(session_uuid, SessionState.CONNECTED)

        audit_log.info(
            EventCategory.CONNECTION,
            f"SSH session established: {profile.username}@{profile.hostname}",
            actor=Actor.SYSTEM,
            profile_id=profile.id,
            session_uuid=session_uuid,
        )

        # Start keep-alive engine
        entry = self._registry.get(session_uuid)
        engine = KeepAliveEngine(
            session_uuid=session_uuid,
            client=client,
            transport_interval_sec=profile.keepalive_transport_interval_sec,
            app_interval_sec=profile.keepalive_app_interval_sec,
            on_heartbeat=lambda ts: self._on_heartbeat(session_uuid, ts),
            on_error=lambda sid, exc: self._on_keepalive_error(sid, exc, profile),
        )
        engine.start()
        with self._lock:
            self._keepalive_engines[session_uuid] = engine

        _notify_state_change(self._registry)

    def _on_heartbeat(self, session_uuid: str, ts: str) -> None:
        entry = self._registry.get(session_uuid)
        if entry:
            entry.last_keepalive_at = ts
            _notify_state_change(self._registry)

    def _on_keepalive_error(
        self, session_uuid: str, exc: Exception, profile: ServerProfile
    ) -> None:
        logger.warning("Keep-alive error for %s: %s - initiating reconnect", session_uuid, exc)
        self._start_reconnect(session_uuid, profile)

    # ------------------------------------------------------------------
    # Disconnect
    # ------------------------------------------------------------------

    def disconnect(self, session_uuid: str) -> None:
        """Cleanly terminate the specified session."""
        with self._lock:
            entry = self._registry.get(session_uuid)
            if not entry:
                return

            # Stop reconnect policy if running
            policy = self._reconnect_policies.pop(session_uuid, None)
            if policy:
                policy.stop()

            # Stop keepalive
            engine = self._keepalive_engines.pop(session_uuid, None)
            if engine:
                engine.stop()

            # Close shell channel
            shell = self._shell_channels.pop(session_uuid, None)
            if shell:
                shell.close()

            # Close SSH client
            client = self._clients.pop(session_uuid, None)
            if client:
                try:
                    client.close()
                except Exception:
                    pass

            self._registry.update_state(session_uuid, SessionState.DISCONNECTED)
            self._registry.remove(session_uuid)

        audit_log.info(
            EventCategory.CONNECTION,
            "SSH session disconnected",
            session_uuid=session_uuid,
        )
        _notify_state_change(self._registry)

    def disconnect_active(self) -> None:
        """Disconnect whatever session is currently active."""
        active = self._registry.get_active()
        if active:
            self.disconnect(active.session_uuid)

    # ------------------------------------------------------------------
    # Reconnect
    # ------------------------------------------------------------------

    def _start_reconnect(self, session_uuid: str, profile: ServerProfile) -> None:
        self._registry.update_state(session_uuid, SessionState.RECONNECTING)
        _notify_state_change(self._registry)

        entry = self._registry.get(session_uuid)
        if not entry:
            return

        # Stop existing keepalive
        engine = self._keepalive_engines.pop(session_uuid, None)
        if engine:
            engine.stop()

        def do_reconnect() -> bool:
            try:
                client = establish_connection(profile)
                with self._lock:
                    self._clients[session_uuid] = client
                    self._registry.update_state(session_uuid, SessionState.CONNECTED)
                new_engine = KeepAliveEngine(
                    session_uuid=session_uuid,
                    client=client,
                    transport_interval_sec=profile.keepalive_transport_interval_sec,
                    app_interval_sec=profile.keepalive_app_interval_sec,
                    on_heartbeat=lambda ts: self._on_heartbeat(session_uuid, ts),
                    on_error=lambda sid, exc: self._on_keepalive_error(sid, exc, profile),
                )
                new_engine.start()
                with self._lock:
                    self._keepalive_engines[session_uuid] = new_engine
                return True
            except Exception:
                return False

        policy = ReconnectPolicy(
            session_uuid=session_uuid,
            reconnect_fn=do_reconnect,
            base_delay_sec=profile.reconnect_base_delay_sec,
            max_attempts=profile.max_reconnect_attempts,
            on_attempt=lambda n: audit_log.info(
                EventCategory.CONNECTION,
                f"Reconnect attempt #{n}",
                session_uuid=session_uuid,
            ),
            on_success=lambda: self._on_reconnect_success(session_uuid),
            on_fault=lambda: self._on_reconnect_fault(session_uuid),
        )
        with self._lock:
            self._reconnect_policies[session_uuid] = policy
        policy.start()

    def _on_reconnect_success(self, session_uuid: str) -> None:
        audit_log.info(
            EventCategory.CONNECTION,
            "Session reconnected successfully",
            session_uuid=session_uuid,
        )
        entry = self._registry.get(session_uuid)
        if entry:
            entry.reconnect_attempt_count = 0
        with self._lock:
            self._reconnect_policies.pop(session_uuid, None)
        _notify_state_change(self._registry)

    def _on_reconnect_fault(self, session_uuid: str) -> None:
        self._registry.update_state(session_uuid, SessionState.FAULT)
        audit_log.error(
            EventCategory.CONNECTION,
            "Session entered FAULT state - max reconnect attempts exhausted",
            session_uuid=session_uuid,
        )
        with self._lock:
            self._reconnect_policies.pop(session_uuid, None)
        _notify_state_change(self._registry)

    # ------------------------------------------------------------------
    # Command Execution
    # ------------------------------------------------------------------

    def execute_command(self, request: CommandRequest) -> CommandResult:
        """Execute a command via exec mode on the active session."""
        active = self._registry.get_exposed()
        if not active:
            return CommandResult(
                command_id=request.command_id,
                status="SESSION_UNAVAILABLE",
                stdout="",
                stderr="No active SSH session. Use server_expose first.",
            )

        client = self._clients.get(active.session_uuid)
        if not client:
            return CommandResult(
                command_id=request.command_id,
                status="SESSION_UNAVAILABLE",
                stdout="",
                stderr="Session client not found.",
            )

        result = run_exec_command(client, request)

        # Update stats
        active.commands_executed += 1
        from datetime import datetime, timezone
        active.last_command_at = datetime.now(timezone.utc).isoformat()

        return result

    # ------------------------------------------------------------------
    # Shell Channel
    # ------------------------------------------------------------------

    def open_shell(self) -> str | None:
        """Open a persistent shell on the active session. Returns session_uuid or None."""
        active = self._registry.get_exposed()
        if not active:
            return None

        with self._lock:
            if active.session_uuid not in self._shell_channels:
                client = self._clients.get(active.session_uuid)
                if not client:
                    return None

                def output_cb(command_id: str, chunk: str, stream: str) -> None:
                    if self._terminal_output_callback:
                        self._terminal_output_callback(
                            active.session_uuid, command_id, chunk, stream
                        )

                shell = ShellChannel(client, output_callback=output_cb)
                shell.open()
                self._shell_channels[active.session_uuid] = shell

        return active.session_uuid

    def send_terminal_input(
        self, request: CommandRequest
    ) -> CommandResult:
        """Send input to the shell channel."""
        active = self._registry.get_exposed()
        if not active:
            return CommandResult(
                command_id=request.command_id,
                status="SESSION_UNAVAILABLE",
                stdout="",
                stderr="No active session.",
            )

        shell = self._shell_channels.get(active.session_uuid)
        if not shell or not shell.is_open():
            # Try to open it
            self.open_shell()
            shell = self._shell_channels.get(active.session_uuid)

        if not shell:
            return CommandResult(
                command_id=request.command_id,
                status="ERROR",
                stdout="",
                stderr="Could not open shell channel.",
            )

        shell.send_raw(request.command_text)
        from shared.constants import CommandStatus
        return CommandResult(
            command_id=request.command_id,
            status=CommandStatus.SENT,
            stdout="",
            stderr="",
            exit_code=None,
            duration_ms=0,
        )

    # ------------------------------------------------------------------
    # State Access
    # ------------------------------------------------------------------

    def get_state_model(self) -> SessionStateModel:
        return self._registry.get_state_model()

    def get_active_session_uuid(self) -> str | None:
        active = self._registry.get_active()
        return active.session_uuid if active else None


# Module-level singleton
_manager: SessionManager | None = None


def get_manager() -> SessionManager:
    global _manager
    if _manager is None:
        _manager = SessionManager()
    return _manager
