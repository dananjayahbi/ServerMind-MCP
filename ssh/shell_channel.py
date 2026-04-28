"""Shell-mode persistent channel for interactive terminal sessions."""

from __future__ import annotations

import logging
import re
import threading
import time
import uuid
from datetime import datetime, timezone
from typing import Callable

import paramiko

from shared.constants import CommandStatus, SHELL_OUTPUT_BUFFER_SIZE
from shared.models import CommandRequest, CommandResult

logger = logging.getLogger(__name__)

# Sentinel used to detect end of command output in shell mode
_SENTINEL_PREFIX = "__SMCP_DONE_"


class ShellChannel:
    """Manages a persistent interactive shell channel over SSH."""

    def __init__(
        self,
        client: paramiko.SSHClient,
        output_callback: Callable[[str, str, str], None] | None = None,
    ) -> None:
        """
        Args:
            client: Connected paramiko SSHClient.
            output_callback: Called with (command_id, chunk_text, stream_name) for each output chunk.
        """
        self._client = client
        self._output_callback = output_callback
        self._channel: paramiko.Channel | None = None
        self._lock = threading.Lock()
        self._reader_thread: threading.Thread | None = None
        self._reader_running: bool = False
        self._output_buf = ""
        self._buf_lock = threading.Lock()

    def open(self) -> None:
        """Open the persistent shell channel."""
        with self._lock:
            if self._channel and not self._channel.closed:
                return  # Already open
            transport = self._client.get_transport()
            if not transport or not transport.is_active():
                raise RuntimeError("SSH transport is not active")
            self._channel = self._client.invoke_shell(term="xterm-256color", width=220, height=50)
            self._channel.setblocking(False)
            # Consume initial banner / prompt
            time.sleep(0.4)
            self._drain_initial()
            # Suppress PTY echo and PS1/PS2/PROMPT_COMMAND so output is clean.
            # stty -echo: stops the terminal from echoing what we type.
            # PS1/PS2/PROMPT_COMMAND='': removes all prompt prefixes.
            # HISTCONTROL: keeps these setup commands out of bash history.
            setup = (
                b"stty -echo 2>/dev/null; "
                b"export PS1='' PS2='' PS3='' PS4='' PROMPT_COMMAND='' "
                b"HISTCONTROL=ignoreboth\n"
            )
            self._channel.sendall(setup)
            # Wait for setup to execute, then drain all resulting noise
            time.sleep(0.5)
            self._drain_initial()
        logger.debug("Shell channel opened (echo + prompts suppressed)")
        self._start_reader()

    def close(self) -> None:
        """Close the shell channel."""
        self._reader_running = False
        with self._lock:
            if self._channel and not self._channel.closed:
                try:
                    self._channel.close()
                except Exception:
                    pass
                self._channel = None
        logger.debug("Shell channel closed")

    def is_open(self) -> bool:
        with self._lock:
            return bool(self._channel and not self._channel.closed)

    def send_raw(self, text: str) -> None:
        """Send raw text + newline to the interactive shell immediately."""
        if not self.is_open():
            raise RuntimeError("Shell channel is not open")
        with self._lock:
            self._channel.sendall((text + "\n").encode())

    def _start_reader(self) -> None:
        """Start the background reader thread that streams output chunks via callback."""
        if self._reader_running:
            return
        self._reader_running = True
        self._reader_thread = threading.Thread(
            target=self._reader_loop,
            name="shell-reader",
            daemon=True,
        )
        self._reader_thread.start()
        logger.debug("Shell reader thread started")

    def _reader_loop(self) -> None:
        """Continuously read output from the shell channel and fire output_callback."""
        while self._reader_running:
            try:
                ch = self._channel
                if ch is None or ch.closed:
                    break
                if ch.recv_ready():
                    data = ch.recv(SHELL_OUTPUT_BUFFER_SIZE)
                    if data:
                        chunk = data.decode("utf-8", errors="replace")
                        if self._output_callback:
                            try:
                                self._output_callback("shell", chunk, "stdout")
                            except Exception:
                                logger.exception("Error in shell output callback")
                else:
                    time.sleep(0.02)
            except Exception:
                break
        self._reader_running = False
        logger.debug("Shell reader thread stopped")

    def send_command(
        self,
        request: CommandRequest,
        wait_ms: int = 1000,
    ) -> CommandResult:
        """Send a command and wait for output to settle."""
        if not self.is_open():
            raise RuntimeError("Shell channel is not open")

        start_ts = time.monotonic()
        sentinel = f"{_SENTINEL_PREFIX}{uuid.uuid4().hex[:8]}"
        full_cmd = f"{request.command_text}\necho {sentinel}\n"

        with self._lock:
            self._channel.sendall(full_cmd.encode())

        # Collect output until sentinel appears or wait_ms expires
        output = self._collect_until_sentinel(sentinel, timeout_sec=request.timeout_sec)
        duration_ms = int((time.monotonic() - start_ts) * 1000)

        # Strip the sentinel and echo of the command from output
        output = re.sub(re.escape(sentinel), "", output).strip()

        if self._output_callback:
            self._output_callback(request.command_id, output, "stdout")

        return CommandResult(
            command_id=request.command_id,
            status=CommandStatus.COMPLETED,
            exit_code=None,  # Not available in shell mode
            stdout=output,
            stderr="",
            truncated=False,
            duration_ms=duration_ms,
        )

    def _drain_initial(self) -> None:
        """Drain any initial shell banner/prompt."""
        time.sleep(0.2)
        try:
            while self._channel.recv_ready():
                self._channel.recv(4096)
        except Exception:
            pass

    def _collect_until_sentinel(self, sentinel: str, timeout_sec: int) -> str:
        buf = ""
        deadline = time.monotonic() + timeout_sec
        while time.monotonic() < deadline:
            try:
                if self._channel and self._channel.recv_ready():
                    data = self._channel.recv(SHELL_OUTPUT_BUFFER_SIZE)
                    if data:
                        buf += data.decode("utf-8", errors="replace")
                        if sentinel in buf:
                            break
            except Exception:
                break
            time.sleep(0.05)
        return buf
