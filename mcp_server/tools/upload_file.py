"""server_upload_file MCP tool handler.

Uploads a local file (on the machine running the MCP server) to the remote
SSH server via SFTP. The file is transferred as-is with no modification.
"""

import json

from ssh.session_manager import get_manager


def handle(arguments: dict) -> str:
    """Uploads a local file to the specified (or first CONNECTED) remote server via SFTP."""
    local_path = arguments["local_path"]
    remote_path = arguments["remote_path"]
    session_uuid = arguments.get("session_uuid")

    manager = get_manager()

    if session_uuid:
        entry = manager._registry.get(session_uuid)
        if not entry or entry.state != "CONNECTED":
            return json.dumps({
                "success": False,
                "error": f"Session {session_uuid} is not CONNECTED (state: {entry.state if entry else 'NOT_FOUND'}).",
            })
    else:
        state = manager.get_state_model()
        if state.state != "CONNECTED":
            return json.dumps({
                "success": False,
                "error": (
                    f"No CONNECTED session available (state: {state.state}). "
                    "Use server_expose first."
                ),
            })

    result = manager.upload_file(local_path, remote_path, session_uuid=session_uuid)
    return json.dumps(result, indent=2)
