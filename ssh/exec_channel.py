"""Exec-mode command execution over SSH."""

from __future__ import annotations

import logging
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


def run_exec_command(
    client: paramiko.SSHClient,
    request: CommandRequest,
    max_output_bytes: int = DEFAULT_MAX_OUTPUT_SIZE,
) -> CommandResult:
    """
    Execute a command via a new exec channel.
    Returns a CommandResult with full stdout/stderr capture.
    """
    start_ts = time.monotonic()
    start_iso = datetime.now(timezone.utc).isoformat()

    try:
        stdin, stdout, stderr = client.exec_command(
            request.command_text,
            timeout=request.timeout_sec,
        )
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
