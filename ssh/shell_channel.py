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
        self._output_callbacks: list[Callable[[str, str, str], None]] = []
        if output_callback:
            self._output_callbacks.append(output_callback)
        self._channel: paramiko.Channel | None = None
        self._lock = threading.Lock()
        self._cb_lock = threading.Lock()
        self._reader_thread: threading.Thread | None = None
        self._reader_running: bool = False
        self._output_buf = ""
        self._buf_lock = threading.Lock()

    def add_output_callback(self, cb: Callable[[str, str, str], None]) -> None:
        """Register an additional output callback."""
        with self._cb_lock:
            if cb not in self._output_callbacks:
                self._output_callbacks.append(cb)

    def remove_output_callback(self, cb: Callable[[str, str, str], None]) -> None:
        """Unregister an output callback."""
        with self._cb_lock:
            self._output_callbacks = [c for c in self._output_callbacks if c is not cb]

    def open(self, suppress_echo: bool = True) -> None:
        """Open the persistent shell channel.

        Args:
            suppress_echo: When True (default, used by the GUI terminal), runs
                ``stty -echo`` and clears PS1 so the Tkinter panel can render
                output without duplication.  Set to False for the xterm.js web
                terminal which needs real PTY echo and the normal shell prompt.
        """
        with self._lock:
            if self._channel and not self._channel.closed:
                return  # Already open
            transport = self._client.get_transport()
            if not transport or not transport.is_active():
                raise RuntimeError("SSH transport is not active")
            self._channel = self._client.invoke_shell(term="xterm-256color", width=220, height=50)
            self._channel.setblocking(False)
            if suppress_echo:
                # GUI mode: wait for channel, drain banner, then suppress echo+PS1
                time.sleep(0.4)
                self._drain_initial()
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
            else:
                # Web / xterm.js mode: brief wait only; DO NOT drain initial output
                # so the reader delivers the MOTD banner + prompt to xterm.js.
                time.sleep(0.1)
                logger.debug("Shell channel opened (web mode - prompt flows to xterm.js)")
        # Start reader BEFORE releasing lock return so initial output is captured
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

    def send_input(self, data: bytes) -> None:
        """Send raw bytes to the shell (used by xterm.js WebSocket bridge — no added newline)."""
        if not self.is_open():
            raise RuntimeError("Shell channel is not open")
        with self._lock:
            self._channel.sendall(data)

    def resize(self, cols: int, rows: int) -> None:
        """Resize the PTY window (propagated to the remote shell via SIGWINCH)."""
        if not self.is_open():
            return
        with self._lock:
            try:
                self._channel.resize_pty(width=max(1, cols), height=max(1, rows))
            except Exception:
                pass

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
                    if not data:
                        # Remote side closed the channel
                        break
                    chunk = data.decode("utf-8", errors="replace")
                    with self._cb_lock:
                        cbs = list(self._output_callbacks)
                    for cb in cbs:
                        try:
                            cb("shell", chunk, "stdout")
                        except Exception:
                            logger.exception("Error in shell output callback")
                else:
                    time.sleep(0.02)
            except OSError:
                # Channel closed by remote — exit cleanly
                break
            except Exception:
                logger.debug("Shell reader non-fatal exception, continuing", exc_info=True)
                time.sleep(0.05)
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

        with self._cb_lock:
            for cb in list(self._output_callbacks):
                try:
                    cb(request.command_id, output, "stdout")
                except Exception:
                    logger.exception("Error in shell output callback")

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
