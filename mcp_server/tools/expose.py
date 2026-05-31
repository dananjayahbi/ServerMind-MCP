"""server_expose MCP tool handler."""

import json

from config.engine import get_engine
from shared.exceptions import ProfileNotFoundError
from ssh.session_manager import get_manager


def handle(arguments: dict) -> str:
    """Initiates an SSH connection to the specified profile. Multiple servers can be exposed simultaneously."""
    profile_id = arguments["profile_id"]

    engine = get_engine()
    try:
        profile = engine.get_profile(profile_id)
    except ProfileNotFoundError:
        return json.dumps({
            "error": "PROFILE_NOT_FOUND",
            "message": f"No server profile found with id: {profile_id}",
        })

    manager = get_manager()
    try:
        session_uuid = manager.expose(profile)
    except Exception as exc:
        return json.dumps({
            "error": "EXPOSE_FAILED",
            "message": str(exc),
        })

    return json.dumps({
        "session_uuid": session_uuid,
        "state": "CONNECTING",
        "profile_id": profile_id,
        "message": (
            f"Connecting to {profile.hostname}:{profile.port}. "
            "Multiple servers can be exposed simultaneously. "
            "Call server_get_session_status to confirm CONNECTED state, then use session_uuid in commands."
        ),
    }, indent=2)
