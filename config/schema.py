"""JSON Schema definition for the ServerMind MCP configuration file."""

CONFIG_SCHEMA: dict = {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "title": "ServerMind MCP Configuration",
    "type": "object",
    "required": ["schema_version", "app_settings", "server_profiles"],
    "additionalProperties": False,
    "properties": {
        "schema_version": {
            "type": "integer",
            "minimum": 1,
        },
        "app_settings": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "ipc_port": {"type": "integer", "minimum": 1024, "maximum": 65535},
                "ui_theme": {"type": "string", "enum": ["dark", "light"]},
                "log_buffer_size": {"type": "integer", "minimum": 100},
                "log_max_file_size_mb": {"type": "integer", "minimum": 1},
                "log_backup_count": {"type": "integer", "minimum": 0},
                "default_command_timeout_sec": {"type": "integer", "minimum": 1},
                "ipc_poll_interval_ms": {"type": "integer", "minimum": 100},
            },
        },
        "server_profiles": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["id", "display_name", "hostname", "username", "ppk_file_path"],
                "additionalProperties": True,
                "properties": {
                    "id": {"type": "string"},
                    "display_name": {"type": "string", "minLength": 1, "maxLength": 64},
                    "hostname": {"type": "string", "minLength": 1},
                    "port": {"type": "integer", "minimum": 1, "maximum": 65535},
                    "username": {"type": "string", "minLength": 1, "maxLength": 64},
                    "ppk_file_path": {"type": "string"},
                    "auth_method": {"type": "string", "enum": ["password", "ppk"]},
                    "password": {"type": "string"},
                    "sudo_password": {"type": "string"},
                    "keepalive_transport_interval_sec": {"type": "integer", "minimum": 10},
                    "keepalive_app_interval_sec": {"type": "integer", "minimum": 15},
                    "connection_timeout_sec": {"type": "integer", "minimum": 5, "maximum": 120},
                    "max_reconnect_attempts": {"type": ["integer", "null"], "minimum": 0},
                    "reconnect_base_delay_sec": {"type": "integer", "minimum": 1, "maximum": 60},
                    "notes": {"type": "string", "maxLength": 512},
                    "created_at": {"type": "string"},
                    "updated_at": {"type": "string"},
                },
            },
        },
    },
}

DEFAULT_APP_SETTINGS: dict = {
    "ipc_port": 17432,
    "ui_theme": "dark",
    "log_buffer_size": 5000,
    "log_max_file_size_mb": 10,
    "log_backup_count": 5,
    "default_command_timeout_sec": 300,
    "ipc_poll_interval_ms": 2000,
}
