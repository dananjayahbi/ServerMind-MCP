"""MCP protocol handler, tool registry, and dispatcher."""

from __future__ import annotations

import json
import logging
from typing import Any

from mcp.server import Server
from mcp.types import (
    CallToolResult,
    ListToolsResult,
    TextContent,
    Tool,
)

from mcp_server.validators.tool_schemas import validate_tool_input
from mcp_server.tools import (
    connect_terminal,
    disconnect,
    execute_command,
    execute_script,
    expose,
    get_session_status,
    list_profiles,
    read_log,
    send_terminal_input,
    upload_file,
)

logger = logging.getLogger(__name__)

# ------------------------------------------------------------------
# Tool catalogue
# ------------------------------------------------------------------

TOOL_CATALOGUE: list[Tool] = [
    Tool(
        name="server_list_profiles",
        description=(
            "Returns a list of all configured server profiles available for exposure. "
            "Does not include sensitive credential paths."
        ),
        inputSchema={
            "type": "object",
            "properties": {},
        },
    ),
    Tool(
        name="server_get_session_status",
        description="Returns the current session state including connection status and statistics.",
        inputSchema={
            "type": "object",
            "properties": {},
        },
    ),
    Tool(
        name="server_expose",
        description=(
            "Initiates an SSH connection to the specified server profile. "
            "Only one server may be exposed at a time. "
            "After calling this, use server_get_session_status to confirm CONNECTED state."
        ),
        inputSchema={
            "type": "object",
            "required": ["profile_id"],
            "properties": {
                "profile_id": {
                    "type": "string",
                    "description": "UUID of the server profile to expose.",
                },
            },
        },
    ),
    Tool(
        name="server_execute_command",
        description=(
            "Executes a shell command on the currently exposed server and returns full output. "
            "Uses exec mode; each command runs in a fresh environment."
        ),
        inputSchema={
            "type": "object",
            "required": ["command"],
            "properties": {
                "command": {
                    "type": "string",
                    "description": "Shell command to execute. May include pipes and redirects.",
                },
                "timeout_sec": {
                    "type": "integer",
                    "description": "Max seconds to wait (default 300).",
                    "default": 300,
                },
            },
        },
    ),
    Tool(
        name="server_execute_script",
        description=(
            "Executes a multi-line bash script on the currently exposed server in a single SSH call. "
            "All commands run sequentially in the same bash environment and the full combined output "
            "is returned at once. Prefer this over multiple server_execute_command calls to reduce "
            "round-trips and token usage."
        ),
        inputSchema={
            "type": "object",
            "required": ["script"],
            "properties": {
                "script": {
                    "type": "string",
                    "description": "Multi-line bash script to execute. Commands run sequentially.",
                },
                "timeout_sec": {
                    "type": "integer",
                    "description": "Max seconds to wait for the whole script (default 300).",
                    "default": 300,
                },
            },
        },
    ),
    Tool(
        name="server_upload_file",
        description=(
            "Uploads a local file (on the machine running the MCP server) to the remote SSH server "
            "via SFTP. Provide the absolute local path and the desired absolute remote path. "
            "Use server_execute_command to extract archives or set permissions after upload."
        ),
        inputSchema={
            "type": "object",
            "required": ["local_path", "remote_path"],
            "properties": {
                "local_path": {
                    "type": "string",
                    "description": "Absolute path to the local file to upload.",
                },
                "remote_path": {
                    "type": "string",
                    "description": "Absolute destination path on the remote server.",
                },
            },
        },
    ),
    Tool(
        name="server_connect_terminal",
        description=(
            "Opens a persistent shell session. Subsequent calls to server_send_terminal_input "
            "preserve shell state (working directory, environment variables)."
        ),
        inputSchema={
            "type": "object",
            "properties": {},
        },
    ),
    Tool(
        name="server_send_terminal_input",
        description=(
            "Sends input to the persistent shell session and waits for output to settle. "
            "Preserves shell state between calls."
        ),
        inputSchema={
            "type": "object",
            "required": ["input"],
            "properties": {
                "input": {
                    "type": "string",
                    "description": "Input line to send. Newline appended automatically.",
                },
                "wait_ms": {
                    "type": "integer",
                    "description": "Ms to wait for output to settle (default 1000).",
                    "default": 1000,
                },
            },
        },
    ),
    Tool(
        name="server_disconnect",
        description="Cleanly terminates the active SSH session.",
        inputSchema={
            "type": "object",
            "properties": {},
        },
    ),
    Tool(
        name="server_read_log",
        description="Retrieves recent audit log entries for the current session.",
        inputSchema={
            "type": "object",
            "properties": {
                "limit": {
                    "type": "integer",
                    "description": "Max entries to return (default 50, max 500).",
                    "default": 50,
                },
                "category": {
                    "type": "string",
                    "description": "Filter by category: CONNECTION, COMMAND, CONFIG, IPC, SYSTEM, SECURITY.",
                },
                "since_timestamp": {
                    "type": "string",
                    "description": "ISO 8601 timestamp; return only entries after this time.",
                },
            },
        },
    ),
]

# ------------------------------------------------------------------
# Handler dispatch table
# ------------------------------------------------------------------

_HANDLERS: dict[str, Any] = {
    "server_list_profiles": list_profiles.handle,
    "server_get_session_status": get_session_status.handle,
    "server_expose": expose.handle,
    "server_execute_command": execute_command.handle,
    "server_execute_script": execute_script.handle,
    "server_upload_file": upload_file.handle,
    "server_connect_terminal": connect_terminal.handle,
    "server_send_terminal_input": send_terminal_input.handle,
    "server_disconnect": disconnect.handle,
    "server_read_log": read_log.handle,
}


# ------------------------------------------------------------------
# MCP Server instance
# ------------------------------------------------------------------

def create_server() -> Server:
    server = Server("servermind-mcp")

    @server.list_tools()
    async def handle_list_tools() -> list[Tool]:
        return TOOL_CATALOGUE

    @server.call_tool()
    async def handle_call_tool(name: str, arguments: dict | None) -> list[TextContent]:
        arguments = arguments or {}

        # Validate input
        violations = validate_tool_input(name, arguments)
        if violations:
            error_msg = json.dumps({
                "error": "VALIDATION_ERROR",
                "violations": violations,
            })
            return [TextContent(type="text", text=error_msg)]

        # Dispatch
        handler = _HANDLERS.get(name)
        if not handler:
            return [TextContent(type="text", text=json.dumps({
                "error": "UNKNOWN_TOOL",
                "message": f"Tool '{name}' is not registered.",
            }))]

        try:
            result_text = handler(arguments)
            return [TextContent(type="text", text=result_text)]
        except Exception as exc:
            logger.exception("Unhandled error in tool handler '%s'", name)
            return [TextContent(type="text", text=json.dumps({
                "error": "INTERNAL_ERROR",
                "message": str(exc),
            }))]

    return server
