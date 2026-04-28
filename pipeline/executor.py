"""Command execution orchestrator — bridges pipeline queue to SSH session manager."""

from __future__ import annotations

import logging
from typing import Any

import audit.logger as audit_log
from shared.constants import Actor, EventCategory, ExecMode
from shared.models import CommandRequest, CommandResult
from ssh.session_manager import get_manager

logger = logging.getLogger(__name__)


def execute(request: CommandRequest) -> CommandResult:
    """
    Execute a CommandRequest via the SSH session manager.
    Selects exec vs shell mode based on request.execution_mode.
    """
    manager = get_manager()

    audit_log.info(
        EventCategory.COMMAND,
        f"Command submitted: {request.command_text[:80]}",
        actor=request.actor,
        session_uuid=manager.get_active_session_uuid(),
        payload={"command_id": request.command_id, "mode": request.execution_mode},
    )

    if request.execution_mode == ExecMode.SHELL:
        result = manager.send_terminal_input(request)
    else:
        result = manager.execute_command(request)

    audit_log.info(
        EventCategory.COMMAND,
        f"Command completed: status={result.status} exit={result.exit_code} "
        f"duration={result.duration_ms}ms",
        actor=request.actor,
        session_uuid=manager.get_active_session_uuid(),
        payload={"command_id": request.command_id, "status": result.status},
    )

    return result
