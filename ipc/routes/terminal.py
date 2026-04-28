"""Terminal command submission endpoint."""

from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter

from ipc.models import TerminalSendRequest, TerminalSendResponse
from ssh.session_manager import get_manager as get_ssh_manager
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
        execution_mode=ExecMode.SHELL,
        timeout_sec=60,
        submitted_at=datetime.now(timezone.utc).isoformat(),
    )
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        None,
        lambda: get_ssh_manager().send_terminal_input(cmd_request),
    )
    if result is None:
        return TerminalSendResponse(
            command_id=command_id,
            status="error",
            message="No active session. Connect a server first.",
        )
    return TerminalSendResponse(
        command_id=result.command_id,
        status=result.status,
        stdout="",
        stderr="",
        exit_code=None,
        duration_ms=0,
        message="sent",
    )
