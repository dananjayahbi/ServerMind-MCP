"""server_list_profiles MCP tool handler."""

import json

from config.engine import get_engine
from ssh.session_manager import get_manager


def handle(arguments: dict) -> str:
    """Returns a JSON list of all configured server profiles with their session states."""
    profiles = get_engine().list_profiles()
    manager = get_manager()
    # Build a map of profile_id -> session state for all active sessions
    active_models = manager.get_state_model_all()
    profile_states: dict[str, str] = {}
    for model in active_models:
        if model.profile_id and model.state != "DISCONNECTED":
            profile_states[model.profile_id] = model.state

    result = []
    for profile in profiles:
        entry = {
            "id": profile.id,
            "display_name": profile.display_name,
            "hostname": profile.hostname,
            "port": profile.port,
            "username": profile.username,
            "notes": profile.notes,
            "session_state": profile_states.get(profile.id),
        }
        result.append(entry)

    return json.dumps(result, indent=2)
