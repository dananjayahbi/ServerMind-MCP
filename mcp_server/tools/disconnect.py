"""server_disconnect MCP tool handler."""

import json

from ssh.session_manager import get_manager
from shared.constants import Actor, EventCategory
import audit.logger as audit_log


def handle(arguments: dict) -> str:
    """Cleanly terminates a specific SSH session by session_uuid."""
    session_uuid = arguments.get("session_uuid")
    manager = get_manager()

    if session_uuid:
        entry = manager._registry.get(session_uuid)
        if not entry or entry.state == "DISCONNECTED":
            return json.dumps({
                "message": f"No active session found: {session_uuid}",
                "session_uuid": session_uuid,
            })
        commands_executed = entry.commands_executed
    else:
        # Backward compat: disconnect first active session
        state = manager.get_state_model()
        if state.state == "DISCONNECTED":
            return json.dumps({
                "message": "No active session to disconnect.",
                "session_uuid": None,
            })
        session_uuid = state.session_uuid
        commands_executed = state.commands_executed

    audit_log.info(
        EventCategory.CONNECTION,
        "Session disconnect requested by agent",
        actor=Actor.AGENT,
        session_uuid=session_uuid,
    )

    manager.disconnect(session_uuid)

    return json.dumps({
        "session_uuid": session_uuid,
        "commands_executed": commands_executed,
        "message": "Session disconnected successfully.",
    }, indent=2)
