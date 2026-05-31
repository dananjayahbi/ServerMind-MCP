"""server_execute_command MCP tool handler."""

import json
import uuid
from datetime import datetime, timezone

from pipeline.queue_manager import get_queue_manager
from shared.constants import Actor, CommandStatus, DEFAULT_COMMAND_TIMEOUT, ExecMode
from shared.models import CommandRequest
from ssh.session_manager import get_manager


def handle(arguments: dict) -> str:
    """Executes a shell command on the specified (or first CONNECTED) server."""
    command = arguments["command"]
    timeout_sec = arguments.get("timeout_sec", DEFAULT_COMMAND_TIMEOUT)
    session_uuid = arguments.get("session_uuid")

    manager = get_manager()

    # Validate the target session
    if session_uuid:
        entry = manager._registry.get(session_uuid)
        if not entry or entry.state != "CONNECTED":
            return json.dumps({
                "status": CommandStatus.SESSION_UNAVAILABLE,
                "error": f"Session {session_uuid} is not CONNECTED (state: {entry.state if entry else 'NOT_FOUND'}).",
            })
    else:
        state = manager.get_state_model()
        if state.state != "CONNECTED":
            return json.dumps({
                "status": CommandStatus.SESSION_UNAVAILABLE,
                "error": f"No CONNECTED session available (state: {state.state}). "
                         "Use server_expose to start a session, then wait for CONNECTED state.",
            })

    request = CommandRequest(
        command_id=str(uuid.uuid4()),
        command_text=command,
        actor=Actor.AGENT,
        execution_mode=ExecMode.EXEC,
        timeout_sec=timeout_sec,
        submitted_at=datetime.now(timezone.utc).isoformat(),
        target_session_uuid=session_uuid,
    )

    result = get_queue_manager().submit(request, timeout=float(timeout_sec) + 10)
    return json.dumps(result.to_dict(), indent=2)
