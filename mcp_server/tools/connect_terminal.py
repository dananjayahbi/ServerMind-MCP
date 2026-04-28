"""server_connect_terminal MCP tool handler."""

import json

from ssh.session_manager import get_manager


def handle(arguments: dict) -> str:
    """Opens or confirms a persistent shell-mode terminal on the exposed server."""
    manager = get_manager()
    state = manager.get_state_model()

    if state.state != "CONNECTED":
        return json.dumps({
            "error": "SESSION_NOT_CONNECTED",
            "message": f"No CONNECTED session (state: {state.state}).",
        })

    session_uuid = manager.open_shell()
    if not session_uuid:
        return json.dumps({
            "error": "SHELL_OPEN_FAILED",
            "message": "Could not open shell channel.",
        })

    return json.dumps({
        "session_uuid": session_uuid,
        "shell_active": True,
        "message": "Shell channel is ready. Use server_send_terminal_input to send commands.",
    }, indent=2)
