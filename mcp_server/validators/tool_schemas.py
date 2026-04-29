"""JSON Schema definitions for all MCP tool input parameters."""

TOOL_SCHEMAS: dict[str, dict] = {
    "server_list_profiles": {
        "type": "object",
        "properties": {},
        "additionalProperties": False,
    },
    "server_get_session_status": {
        "type": "object",
        "properties": {},
        "additionalProperties": False,
    },
    "server_expose": {
        "type": "object",
        "required": ["profile_id"],
        "properties": {
            "profile_id": {"type": "string", "minLength": 1},
        },
        "additionalProperties": False,
    },
    "server_execute_command": {
        "type": "object",
        "required": ["command"],
        "properties": {
            "command": {"type": "string", "minLength": 1},
            "timeout_sec": {"type": "integer", "minimum": 1, "maximum": 3600},
        },
        "additionalProperties": False,
    },
    "server_execute_script": {
        "type": "object",
        "required": ["script"],
        "properties": {
            "script": {"type": "string", "minLength": 1},
            "timeout_sec": {"type": "integer", "minimum": 1, "maximum": 3600},
        },
        "additionalProperties": False,
    },
    "server_upload_file": {
        "type": "object",
        "required": ["local_path", "remote_path"],
        "properties": {
            "local_path": {"type": "string", "minLength": 1},
            "remote_path": {"type": "string", "minLength": 1},
        },
        "additionalProperties": False,
    },
    "server_connect_terminal": {
        "type": "object",
        "properties": {},
        "additionalProperties": False,
    },
    "server_send_terminal_input": {
        "type": "object",
        "required": ["input"],
        "properties": {
            "input": {"type": "string"},
            "wait_ms": {"type": "integer", "minimum": 100, "maximum": 30000},
        },
        "additionalProperties": False,
    },
    "server_disconnect": {
        "type": "object",
        "properties": {},
        "additionalProperties": False,
    },
    "server_read_log": {
        "type": "object",
        "properties": {
            "limit": {"type": "integer", "minimum": 1, "maximum": 500},
            "category": {
                "type": "string",
                "enum": ["CONNECTION", "COMMAND", "CONFIG", "IPC", "SYSTEM", "SECURITY"],
            },
            "since_timestamp": {"type": "string"},
        },
        "additionalProperties": False,
    },
}


def validate_tool_input(tool_name: str, arguments: dict) -> list[str]:
    """
    Validate tool arguments against the schema.
    Returns a list of violation messages (empty list = valid).
    """
    import jsonschema

    schema = TOOL_SCHEMAS.get(tool_name)
    if schema is None:
        return [f"Unknown tool: {tool_name}"]

    validator = jsonschema.Draft7Validator(schema)
    return [e.message for e in validator.iter_errors(arguments or {})]
