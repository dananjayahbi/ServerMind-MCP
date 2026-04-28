"""Keep-Alive Engine for maintaining SSH sessions across inactivity periods."""

from __future__ import annotations

import logging
import threading
import time
from datetime import datetime, timezone
from typing import Callable

import paramiko

logger = logging.getLogger(__name__)


class KeepAliveEngine:
    """
    Runs two keep-alive mechanisms for a live SSH session:
    1. Transport-level: paramiko's built-in keepalive (SSH_MSG_GLOBAL_REQUEST)
    2. Application-level: periodic no-op command execution
    """

    def __init__(
        self,
        session_uuid: str,
        client: paramiko.SSHClient,
        transport_interval_sec: int = 30,
        app_interval_sec: int = 60,
        on_heartbeat: Callable[[str], None] | None = None,
        on_error: Callable[[str, Exception], None] | None = None,
    ) -> None:
        self._session_uuid = session_uuid
        self._client = client
        self._transport_interval = transport_interval_sec
        self._app_interval = app_interval_sec
        self._on_heartbeat = on_heartbeat
        self._on_error = on_error
        self._stop_event = threading.Event()
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        """Start the keep-alive background thread."""
        transport = self._client.get_transport()
        if transport:
            transport.set_keepalive(self._transport_interval)

        self._stop_event.clear()
        self._thread = threading.Thread(
            target=self._run,
            name=f"ssh-keepalive-{self._session_uuid[:8]}",
            daemon=True,
        )
        self._thread.start()
        logger.debug("Keep-alive engine started for session %s", self._session_uuid)

    def stop(self) -> None:
        """Stop the keep-alive thread."""
        self._stop_event.set()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=5)
        logger.debug("Keep-alive engine stopped for session %s", self._session_uuid)

    def _run(self) -> None:
        last_app_ping = time.monotonic()
        while not self._stop_event.wait(timeout=1.0):
            now = time.monotonic()
            if now - last_app_ping >= self._app_interval:
                self._send_app_heartbeat()
                last_app_ping = now

    def _send_app_heartbeat(self) -> None:
        try:
            transport = self._client.get_transport()
            if not transport or not transport.is_active():
                return

            _, stdout, _ = self._client.exec_command("true", timeout=10)
            stdout.channel.recv_exit_status()
            ts = datetime.now(timezone.utc).isoformat()
            logger.debug("Keep-alive heartbeat sent for session %s", self._session_uuid)

            if self._on_heartbeat:
                self._on_heartbeat(ts)

        except Exception as exc:
            logger.warning(
                "Keep-alive heartbeat failed for session %s: %s",
                self._session_uuid,
                exc,
            )
            if self._on_error:
                self._on_error(self._session_uuid, exc)
