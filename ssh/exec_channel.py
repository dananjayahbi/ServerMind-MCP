"""Exec-mode command execution over SSH."""

from __future__ import annotations

import logging
import re
import time
from datetime import datetime, timezone

import paramiko

from shared.constants import (
    DEFAULT_COMMAND_TIMEOUT,
    DEFAULT_MAX_OUTPUT_SIZE,
    Actor,
    CommandStatus,
)
from shared.models import CommandRequest, CommandResult

logger = logging.getLogger(__name__)

_SUDO_RE = re.compile(r'\bsudo\b')


def _inject_sudo_flags(command: str) -> str:
    """Add -S (read password from stdin) and -p '' (empty prompt) to every sudo call."""
    # Replace 'sudo ' (not already followed by -S) with 'sudo -S -p "" '
    return re.sub(r'\bsudo\s+(?!-S\b)', 'sudo -S -p "" ', command)


def run_exec_command(
    client: paramiko.SSHClient,
    request: CommandRequest,
    max_output_bytes: int = DEFAULT_MAX_OUTPUT_SIZE,
    sudo_password: str | None = None,
) -> CommandResult:
    """
    Execute a command via a new exec channel.
    Returns a CommandResult with full stdout/stderr capture.
    """
    start_ts = time.monotonic()
    start_iso = datetime.now(timezone.utc).isoformat()

    try:
        cmd = request.command_text
        use_sudo = bool(sudo_password) and bool(_SUDO_RE.search(cmd))
        if use_sudo:
            cmd = _inject_sudo_flags(cmd)

        stdin, stdout, stderr = client.exec_command(
            cmd,
            timeout=request.timeout_sec,
        )

        if use_sudo:
            try:
                stdin.write(sudo_password + "\n")
                stdin.flush()
            except Exception:
                pass
        stdin.close()

        # Read stdout and stderr
        stdout_data = _read_limited(stdout, max_output_bytes)
        stderr_data = _read_limited(stderr, max_output_bytes)

        exit_code = stdout.channel.recv_exit_status()
        duration_ms = int((time.monotonic() - start_ts) * 1000)

        truncated = (
            len(stdout_data.encode()) >= max_output_bytes
            or len(stderr_data.encode()) >= max_output_bytes
        )

        if truncated:
            stdout_data += "\n[OUTPUT TRUNCATED]"

        return CommandResult(
            command_id=request.command_id,
            status=CommandStatus.COMPLETED,
            exit_code=exit_code,
            stdout=stdout_data,
            stderr=stderr_data,
            truncated=truncated,
            duration_ms=duration_ms,
            completed_at=datetime.now(timezone.utc).isoformat(),
        )

    except TimeoutError:
        duration_ms = int((time.monotonic() - start_ts) * 1000)
        logger.warning("Command %s timed out after %ds", request.command_id, request.timeout_sec)
        return CommandResult(
            command_id=request.command_id,
            status=CommandStatus.TIMED_OUT,
            exit_code=None,
            stdout="",
            stderr=f"Command timed out after {request.timeout_sec}s",
            truncated=False,
            duration_ms=duration_ms,
        )
    except Exception as exc:
        duration_ms = int((time.monotonic() - start_ts) * 1000)
        logger.error("Command %s exec error: %s", request.command_id, exc)
        return CommandResult(
            command_id=request.command_id,
            status=CommandStatus.ERROR,
            exit_code=None,
            stdout="",
            stderr=str(exc),
            truncated=False,
            duration_ms=duration_ms,
        )


def run_exec_script(
    client: paramiko.SSHClient,
    request: CommandRequest,
    max_output_bytes: int = DEFAULT_MAX_OUTPUT_SIZE,
    sudo_password: str | None = None,
) -> CommandResult:
    """
    Execute a multi-line bash script by feeding it via stdin to 'bash -s'.
    All commands run in the same shell environment in sequence.
    Returns a CommandResult with combined stdout/stderr.
    """
    start_ts = time.monotonic()

    try:
        script = request.command_text
        # If sudo_password is set and the script contains sudo, patch all sudo calls
        if sudo_password and _SUDO_RE.search(script):
            script = re.sub(r'\bsudo\s+(?!-S\b)', 'sudo -S -p "" ', script)
            # Prepend a line that feeds the password to sudo once so the ticket is valid
            safe_pw = sudo_password.replace("'", "'\\''")
            script = f"echo '{safe_pw}' | sudo -S -p '' true 2>/dev/null\n" + script

        stdin, stdout, stderr = client.exec_command(
            "bash -s",
            timeout=request.timeout_sec,
        )
        # Write the full script then signal EOF
        stdin.write(script.encode("utf-8"))
        stdin.channel.shutdown_write()
        stdin.close()

        stdout_data = _read_limited(stdout, max_output_bytes)
        stderr_data = _read_limited(stderr, max_output_bytes)
        exit_code = stdout.channel.recv_exit_status()
        duration_ms = int((time.monotonic() - start_ts) * 1000)

        truncated = (
            len(stdout_data.encode()) >= max_output_bytes
            or len(stderr_data.encode()) >= max_output_bytes
        )
        if truncated:
            stdout_data += "\n[OUTPUT TRUNCATED]"

        return CommandResult(
            command_id=request.command_id,
            status=CommandStatus.COMPLETED,
            exit_code=exit_code,
            stdout=stdout_data,
            stderr=stderr_data,
            truncated=truncated,
            duration_ms=duration_ms,
            completed_at=datetime.now(timezone.utc).isoformat(),
        )

    except TimeoutError:
        duration_ms = int((time.monotonic() - start_ts) * 1000)
        return CommandResult(
            command_id=request.command_id,
            status=CommandStatus.TIMED_OUT,
            exit_code=None,
            stdout="",
            stderr=f"Script timed out after {request.timeout_sec}s",
            truncated=False,
            duration_ms=duration_ms,
        )
    except Exception as exc:
        duration_ms = int((time.monotonic() - start_ts) * 1000)
        logger.error("Script %s exec error: %s", request.command_id, exc)
        return CommandResult(
            command_id=request.command_id,
            status=CommandStatus.ERROR,
            exit_code=None,
            stdout="",
            stderr=str(exc),
            truncated=False,
            duration_ms=duration_ms,
        )


def _read_limited(stream: paramiko.ChannelFile, max_bytes: int) -> str:
    """Read from a channel stream up to max_bytes."""
    chunks = []
    total = 0
    try:
        for chunk in stream:
            encoded = chunk if isinstance(chunk, bytes) else chunk.encode()
            chunks.append(encoded)
            total += len(encoded)
            if total >= max_bytes:
                break
    except Exception:
        pass
    raw = b"".join(chunks)[:max_bytes]
    return raw.decode("utf-8", errors="replace")
