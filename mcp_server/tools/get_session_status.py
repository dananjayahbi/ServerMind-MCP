"""server_get_session_status MCP tool handler."""

import json

from ssh.session_manager import get_manager


def handle(arguments: dict) -> str:
    """Returns the current session state as JSON."""
    model = get_manager().get_state_model()
    return json.dumps(model.to_dict(), indent=2)
