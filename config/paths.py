"""Platform-appropriate path resolution for ServerMind MCP data files."""

import os
import sys
from pathlib import Path

from shared.constants import APP_NAME


def get_app_data_dir() -> Path:
    """Return the platform-appropriate user data directory."""
    if sys.platform == "win32":
        base = os.environ.get("APPDATA", Path.home() / "AppData" / "Roaming")
        return Path(base) / APP_NAME
    else:
        xdg = os.environ.get("XDG_CONFIG_HOME", "")
        if xdg:
            return Path(xdg) / APP_NAME
        return Path.home() / ".config" / APP_NAME


def get_config_path() -> Path:
    return get_app_data_dir() / "config.json"


def get_runtime_state_path() -> Path:
    return get_app_data_dir() / "runtime.json"


def get_log_dir() -> Path:
    return get_app_data_dir() / "logs"


def get_known_hosts_path() -> Path:
    return get_app_data_dir() / "known_hosts"


def ensure_app_data_dir() -> Path:
    """Create the app data directory and return its path."""
    app_dir = get_app_data_dir()
    app_dir.mkdir(parents=True, exist_ok=True)
    get_log_dir().mkdir(parents=True, exist_ok=True)
    return app_dir
