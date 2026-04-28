"""Text and timestamp formatting helpers for the GUI."""

from __future__ import annotations

from datetime import datetime, timezone


def format_timestamp(iso_str: str | None, *, include_date: bool = False) -> str:
    """Convert ISO 8601 string to a readable local time string."""
    if not iso_str:
        return "-"
    try:
        dt = datetime.fromisoformat(iso_str.replace("Z", "+00:00"))
        local_dt = dt.astimezone()
        if include_date:
            return local_dt.strftime("%Y-%m-%d %H:%M:%S")
        return local_dt.strftime("%H:%M:%S")
    except ValueError:
        return iso_str


def format_duration(start_iso: str | None) -> str:
    """Return a human-readable duration string from start time to now."""
    if not start_iso:
        return "-"
    try:
        start = datetime.fromisoformat(start_iso.replace("Z", "+00:00"))
        delta = datetime.now(timezone.utc) - start
        total_seconds = int(delta.total_seconds())
        if total_seconds < 60:
            return f"{total_seconds}s"
        if total_seconds < 3600:
            return f"{total_seconds // 60}m {total_seconds % 60}s"
        hours = total_seconds // 3600
        minutes = (total_seconds % 3600) // 60
        return f"{hours}h {minutes}m"
    except ValueError:
        return "-"


def truncate(text: str, max_length: int = 60) -> str:
    """Truncate text to max_length with ellipsis."""
    if len(text) <= max_length:
        return text
    return text[: max_length - 3] + "..."


def state_to_colour_key(state: str) -> str:
    """Map session state string to theme colour key."""
    mapping = {
        "CONNECTED": "accent_green",
        "CONNECTING": "accent_yellow",
        "RECONNECTING": "accent_orange",
        "FAULT": "accent_red",
        "DISCONNECTED": "fg_muted",
    }
    return mapping.get(state, "fg_muted")
