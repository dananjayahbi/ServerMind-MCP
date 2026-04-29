"""server_upload_file MCP tool handler.

Uploads a local file (on the machine running the MCP server) to the remote
SSH server via SFTP. The file is transferred as-is with no modification.
"""

import json

from ssh.session_manager import get_manager


def handle(arguments: dict) -> str:
    """Uploads a local file to the remote server via SFTP."""
    local_path = arguments["local_path"]
    remote_path = arguments["remote_path"]

    manager = get_manager()
    state = manager.get_state_model()

    if state.state != "CONNECTED":
        return json.dumps({
            "success": False,
            "error": (
                f"Session is not CONNECTED (current state: {state.state}). "
                "Use server_expose first."
            ),
        })

    result = manager.upload_file(local_path, remote_path)
    return json.dumps(result, indent=2)
