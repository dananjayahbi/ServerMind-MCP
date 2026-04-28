"""server_disconnect MCP tool handler."""

import json

from ssh.session_manager import get_manager
from shared.constants import Actor, EventCategory
import audit.logger as audit_log


def handle(arguments: dict) -> str:
    """Cleanly terminates the active SSH session."""
    manager = get_manager()
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

    manager.disconnect_active()

    return json.dumps({
        "session_uuid": session_uuid,
        "commands_executed": commands_executed,
        "message": "Session disconnected successfully.",
    }, indent=2)
