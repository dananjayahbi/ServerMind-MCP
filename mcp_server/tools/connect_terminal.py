"""server_connect_terminal MCP tool handler."""

import json

from ssh.session_manager import get_manager


def handle(arguments: dict) -> str:
    """Opens or confirms a persistent shell-mode terminal on the specified (or first CONNECTED) server."""
    session_uuid = arguments.get("session_uuid")
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

    opened_uuid = manager.open_shell(session_uuid=session_uuid)
    if not opened_uuid:
        return json.dumps({
            "error": "SHELL_OPEN_FAILED",
            "message": "Could not open shell channel.",
        })

    return json.dumps({
        "session_uuid": opened_uuid,
        "shell_active": True,
        "message": "Shell channel is ready. Use server_send_terminal_input with this session_uuid to send commands.",
    }, indent=2)
