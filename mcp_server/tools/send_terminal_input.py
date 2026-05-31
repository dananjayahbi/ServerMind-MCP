"""server_send_terminal_input MCP tool handler."""

import json
import uuid
from datetime import datetime, timezone

from pipeline.queue_manager import get_queue_manager
from shared.constants import Actor, ExecMode
from shared.models import CommandRequest
from ssh.session_manager import get_manager


def handle(arguments: dict) -> str:
    """Sends input to the specified (or first CONNECTED) shell session and captures output."""
    input_text = arguments["input"]
    wait_ms = arguments.get("wait_ms", 1000)
    session_uuid = arguments.get("session_uuid")

    if not input_text.endswith("\n"):
        input_text += "\n"

    manager = get_manager()

    if session_uuid:
        entry = manager._registry.get(session_uuid)
        if not entry or entry.state != "CONNECTED":
            return json.dumps({
                "error": "SESSION_NOT_CONNECTED",
                "message": f"Session {session_uuid} is not CONNECTED (state: {entry.state if entry else 'NOT_FOUND'}).",
            })
    else:
        state = manager.get_state_model()
        if state.state != "CONNECTED":
            return json.dumps({
                "error": "SESSION_NOT_CONNECTED",
                "message": f"No CONNECTED session available (state: {state.state}).",
            })

    request = CommandRequest(
        command_id=str(uuid.uuid4()),
        command_text=input_text,
        actor=Actor.AGENT,
        execution_mode=ExecMode.SHELL,
        timeout_sec=max(10, wait_ms // 1000 + 5),
        submitted_at=datetime.now(timezone.utc).isoformat(),
        target_session_uuid=session_uuid,
    )

    result = get_queue_manager().submit(request, timeout=float(request.timeout_sec) + 5)
    return json.dumps(result.to_dict(), indent=2)
