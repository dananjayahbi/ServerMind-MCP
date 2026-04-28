"""server_list_profiles MCP tool handler."""

import json

from config.engine import get_engine
from ssh.session_manager import get_manager


def handle(arguments: dict) -> str:
    """Returns a JSON list of all configured server profiles."""
    profiles = get_engine().list_profiles()
    session_model = get_manager().get_state_model()

    result = []
    for profile in profiles:
        entry = {
            "id": profile.id,
            "display_name": profile.display_name,
            "hostname": profile.hostname,
            "port": profile.port,
            "username": profile.username,
            "notes": profile.notes,
            "session_state": None,
        }
        # Attach session state if this profile is the active one
        if (
            session_model.profile_id == profile.id
            and session_model.state != "DISCONNECTED"
        ):
            entry["session_state"] = session_model.state
        result.append(entry)

    return json.dumps(result, indent=2)
