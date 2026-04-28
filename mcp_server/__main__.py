"""
MCP backend entry point.

Startup sequence:
1. Load configuration
2. Start audit logger
3. Generate IPC token and write runtime state file
4. Start IPC bridge (FastAPI) in a background thread
5. Start command queue consumer
6. Start MCP protocol listener (stdio or SSE)
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import sys
import threading

logger = logging.getLogger(__name__)


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="servermind-mcp",
        description="ServerMind MCP - SSH infrastructure control for AI agents",
    )
    parser.add_argument(
        "--transport",
        choices=["stdio", "sse"],
        default="stdio",
        help="MCP transport mode (default: stdio)",
    )
    parser.add_argument(
        "--sse-port",
        type=int,
        default=17433,
        help="Port for SSE transport (default: 17433)",
    )
    return parser.parse_args()


def _start_ipc_bridge(port: int, token: str) -> None:
    """Start the IPC bridge in a background thread."""
    from ipc.bridge import start_bridge

    def run():
        try:
            start_bridge(port=port, token=token)
        except Exception as exc:
            logger.critical("IPC bridge crashed: %s", exc)

    thread = threading.Thread(target=run, name="ipc-bridge", daemon=True)
    thread.start()


def main() -> None:
    args = _parse_args()

    # 1. Load configuration
    from config.engine import get_engine
    engine = get_engine()
    engine.load()
    settings = engine.get_app_settings()

    # 2. Start audit logger
    import audit.logger as audit_log
    from shared.constants import EventCategory
    audit_log.start(
        buffer_size=settings.get("log_buffer_size", 5000),
        max_file_size_mb=settings.get("log_max_file_size_mb", 10),
        backup_count=settings.get("log_backup_count", 5),
    )
    audit_log.info(EventCategory.SYSTEM, "MCP backend starting up")

    # 3. Generate IPC token and write runtime state
    from ipc.auth import generate_token, write_runtime_state, set_current_token
    ipc_port = settings.get("ipc_port", 17432)
    token = generate_token()
    set_current_token(token)
    write_runtime_state(token=token, port=ipc_port)
    logger.info("IPC token generated; runtime state written")

    # 4. Start IPC bridge in background thread
    _start_ipc_bridge(port=ipc_port, token=token)

    # 5. Start command queue consumer
    from pipeline.queue_manager import get_queue_manager
    queue_manager = get_queue_manager()
    queue_manager.start()

    # 6. Wire audit log -> IPC event bus
    from ipc.event_bus import publish_sync
    from shared.constants import WSEventType

    def _on_log_entry(entry) -> None:
        publish_sync(WSEventType.LOG_ENTRY, entry.to_dict())

    audit_log.add_emit_callback(_on_log_entry)

    # 7. Wire session state changes -> IPC event bus
    from ssh.session_manager import add_state_change_callback, get_manager as get_ssh_manager

    def _on_state_change(state_model) -> None:
        publish_sync(WSEventType.SESSION_STATE_CHANGED, state_model.to_dict())

    add_state_change_callback(_on_state_change)

    # 8. Wire terminal output chunks -> IPC event bus
    def _on_terminal_chunk(session_uuid: str, command_id: str, chunk: str, stream: str) -> None:
        publish_sync(WSEventType.TERMINAL_OUTPUT_CHUNK, {
            "session_uuid": session_uuid,
            "command_id": command_id,
            "chunk": chunk,
            "stream": stream,
        })

    get_ssh_manager().set_terminal_output_callback(_on_terminal_chunk)

    # 9. Wire command results -> IPC event bus
    def _on_command_result(result) -> None:
        publish_sync(WSEventType.COMMAND_COMPLETED, result.to_dict())
        # Also echo the command I/O to the web terminal so users can watch
        # what the AI agent is executing in real-time.
        chunk = ""
        if result.stdout:
            chunk += result.stdout
        if result.stderr:
            chunk += result.stderr
        if chunk:
            publish_sync(WSEventType.TERMINAL_OUTPUT_CHUNK, {
                "session_uuid": "",
                "command_id": result.command_id,
                "chunk": chunk,
                "stream": "exec",
            })

    queue_manager.set_result_callback(_on_command_result)

    audit_log.info(EventCategory.SYSTEM, "MCP backend started successfully")

    # 10. Start MCP protocol listener
    from mcp_server.server import create_server
    mcp_server = create_server()

    if args.transport == "stdio":
        from mcp_server.transport.stdio_transport import run_stdio
        asyncio.run(run_stdio(mcp_server))
    else:
        from mcp_server.transport.sse_transport import run_sse
        asyncio.run(run_sse(mcp_server, host="127.0.0.1", port=args.sse_port))

    # Shutdown
    queue_manager.stop()
    audit_log.info(EventCategory.SYSTEM, "MCP backend shutting down")
    audit_log.stop()


if __name__ == "__main__":
    main()
