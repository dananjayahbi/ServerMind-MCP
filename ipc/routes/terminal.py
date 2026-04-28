"""Terminal command submission endpoint."""

from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter

from ipc.models import TerminalSendRequest, TerminalSendResponse
from pipeline.queue_manager import get_queue_manager
from shared.constants import Actor, ExecMode
from shared.models import CommandRequest

router = APIRouter()


@router.post("/terminal/send", response_model=TerminalSendResponse)
async def terminal_send(request: TerminalSendRequest) -> TerminalSendResponse:
    command_id = str(uuid.uuid4())
    cmd_request = CommandRequest(
        command_id=command_id,
        command_text=request.command_text,
        actor=Actor.OPERATOR,
        execution_mode=ExecMode.EXEC,
        timeout_sec=60,
        submitted_at=datetime.now(timezone.utc).isoformat(),
    )
    # Run in a thread to avoid blocking the event loop
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        None,
        lambda: get_queue_manager().submit(cmd_request, timeout=65),
    )
    if result is None:
        return TerminalSendResponse(
            command_id=command_id,
            status="error",
            message="Command timed out or no active session.",
        )
    return TerminalSendResponse(
        command_id=result.command_id,
        status=result.status,
        stdout=result.stdout,
        stderr=result.stderr,
        exit_code=result.exit_code,
        duration_ms=result.duration_ms,
        message="ok",
    )
