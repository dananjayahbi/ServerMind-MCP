"""IPC token generation and validation."""

from __future__ import annotations

import json
import os
import stat
import time
from datetime import datetime, timezone
from pathlib import Path

from config.paths import get_runtime_state_path, ensure_app_data_dir

_current_token: str | None = None


def generate_token() -> str:
    """Generate a cryptographically random 32-byte hex token."""
    return os.urandom(32).hex()


def write_runtime_state(token: str, port: int) -> None:
    """Write the IPC token and port to the runtime state file."""
    ensure_app_data_dir()
    path = get_runtime_state_path()
    state = {
        "ipc_token": token,
        "ipc_port": port,
        "pid": os.getpid(),
        "started_at": datetime.now(timezone.utc).isoformat(),
    }
    path.write_text(json.dumps(state, indent=2), encoding="utf-8")
    # Set permissions to owner-only (600) on POSIX systems
    try:
        path.chmod(stat.S_IRUSR | stat.S_IWUSR)
    except (AttributeError, NotImplementedError):
        pass  # Windows doesn't support POSIX chmod


def read_runtime_state() -> dict | None:
    """Read the runtime state file. Returns None if not found or malformed."""
    path = get_runtime_state_path()
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def set_current_token(token: str) -> None:
    global _current_token
    _current_token = token


def get_current_token() -> str | None:
    return _current_token


def validate_token(provided: str | None) -> bool:
    """Constant-time comparison to prevent timing attacks."""
    if not provided or not _current_token:
        return False
    import hmac
    return hmac.compare_digest(provided, _current_token)
