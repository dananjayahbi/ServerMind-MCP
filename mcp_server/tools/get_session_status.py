"""server_get_session_status MCP tool handler."""

import json

from ssh.session_manager import get_manager


def handle(arguments: dict) -> str:
    """Returns current session state(s) as JSON.

    If session_uuid is provided, returns status of that specific session.
    Otherwise returns a list of all active sessions (or DISCONNECTED if none).
    """
    manager = get_manager()
    session_uuid = arguments.get("session_uuid")

    if session_uuid:
        entry = manager._registry.get(session_uuid)
        if entry:
            return json.dumps(entry.to_state_model().to_dict(), indent=2)
        return json.dumps({"state": "NOT_FOUND", "session_uuid": session_uuid})

    models = manager.get_state_model_all()
    if len(models) == 1:
        return json.dumps(models[0].to_dict(), indent=2)
    return json.dumps([m.to_dict() for m in models], indent=2)
