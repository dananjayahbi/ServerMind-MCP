"""SSE transport adapter for HTTP-based MCP clients (VS Code Copilot, etc.)."""

import logging

logger = logging.getLogger(__name__)


async def run_sse(mcp_server, host: str = "127.0.0.1", port: int = 17433) -> None:
    """Run the MCP server using SSE transport."""
    from mcp.server.sse import SseServerTransport
    from starlette.applications import Starlette
    from starlette.routing import Mount, Route
    import uvicorn

    sse = SseServerTransport("/messages/")

    async def handle_sse(request):
        async with sse.connect_sse(
            request.scope, request.receive, request._send
        ) as streams:
            await mcp_server.run(
                streams[0],
                streams[1],
                mcp_server.create_initialization_options(),
            )

    starlette_app = Starlette(
        routes=[
            Route("/sse", endpoint=handle_sse),
            Mount("/messages/", app=sse.handle_post_message),
        ]
    )

    logger.info("Starting MCP server in SSE mode on %s:%d", host, port)
    config = uvicorn.Config(starlette_app, host=host, port=port, log_level="warning")
    server = uvicorn.Server(config)
    await server.serve()
