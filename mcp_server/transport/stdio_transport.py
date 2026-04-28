"""stdio transport adapter (primary mode for Claude Code integration)."""
# The mcp SDK handles stdio transport natively via mcp.server.stdio.
# This module is a thin wrapper for documentation and lifecycle management.

import logging

logger = logging.getLogger(__name__)


async def run_stdio(mcp_server) -> None:
    """Run the MCP server using stdio transport."""
    from mcp.server.stdio import stdio_server
    logger.info("Starting MCP server in stdio mode")
    async with stdio_server() as (read_stream, write_stream):
        await mcp_server.run(
            read_stream,
            write_stream,
            mcp_server.create_initialization_options(),
        )
