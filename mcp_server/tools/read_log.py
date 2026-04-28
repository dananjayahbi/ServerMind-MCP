"""server_read_log MCP tool handler."""

import json

from audit.logger import get_ring_buffer


def handle(arguments: dict) -> str:
    """Retrieves recent audit log entries."""
    limit = min(arguments.get("limit", 50), 500)
    category = arguments.get("category")
    since_timestamp = arguments.get("since_timestamp")

    entries = get_ring_buffer().get_filtered(
        limit=limit,
        category=category,
        since_timestamp=since_timestamp,
    )

    return json.dumps([e.to_dict() for e in entries], indent=2)
