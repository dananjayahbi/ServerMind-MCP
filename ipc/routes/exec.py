"""Quick command execution endpoint for statistics / UI polling."""

from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from shared.constants import Actor, ExecMode
from shared.models import CommandRequest
from ssh.session_manager import get_manager

router = APIRouter()


class ExecRequest(BaseModel):
    command: str
    timeout_sec: int = 10


@router.post("/exec")
async def exec_command(req: ExecRequest) -> JSONResponse:
    """Run a single command on the active session and return stdout/stderr."""
    manager = get_manager()
    state = manager.get_state_model()
    if state.state != "CONNECTED":
        return JSONResponse(
            status_code=400,
            content={"error": "SESSION_NOT_CONNECTED", "stdout": "", "stderr": ""},
        )

    command_id = str(uuid.uuid4())
    request = CommandRequest(
        command_id=command_id,
        command_text=req.command,
        actor=Actor.OPERATOR,
        execution_mode=ExecMode.EXEC,
        timeout_sec=req.timeout_sec,
        submitted_at=datetime.now(timezone.utc).isoformat(),
    )
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, lambda: manager.execute_command(request))

    return JSONResponse({
        "stdout": result.stdout,
        "stderr": result.stderr,
        "exit_code": result.exit_code,
        "status": result.status,
    })
