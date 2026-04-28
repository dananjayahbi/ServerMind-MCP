"""FastAPI IPC bridge — startup, middleware, and WebSocket handler."""

from __future__ import annotations

import asyncio
import logging

import uvicorn
from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from ipc.auth import validate_token
from ipc.event_bus import get_async_queue, set_async_queue, set_running_loop
from ipc.routes import health, logs, profiles, session, terminal
from ipc.websocket import get_ws_manager
from shared.constants import IPC_API_PREFIX, IPC_BIND_HOST

logger = logging.getLogger(__name__)

app = FastAPI(title="ServerMind MCP IPC Bridge", version="1.0.0", docs_url=None)

# CORS is intentionally restrictive — loopback only
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1", "http://localhost"],
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type", "X-IPC-Token"],
)


# ------------------------------------------------------------------
# Authentication middleware
# ------------------------------------------------------------------

UNAUTHENTICATED_PATHS = {f"{IPC_API_PREFIX}/health"}


@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    path = request.url.path
    if path in UNAUTHENTICATED_PATHS:
        return await call_next(request)

    # Accept token from either X-IPC-Token or Authorization: Bearer <token>
    token = request.headers.get("X-IPC-Token", "")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        token = auth_header.removeprefix("Bearer ").strip() if auth_header else ""

    if not validate_token(token):
        return JSONResponse(status_code=401, content={"detail": "Unauthorized"})

    return await call_next(request)


# ------------------------------------------------------------------
# Routers
# ------------------------------------------------------------------

app.include_router(health.router, prefix=IPC_API_PREFIX)
app.include_router(session.router, prefix=IPC_API_PREFIX)
app.include_router(profiles.router, prefix=IPC_API_PREFIX)
app.include_router(logs.router, prefix=IPC_API_PREFIX)
app.include_router(terminal.router, prefix=IPC_API_PREFIX)


# ------------------------------------------------------------------
# Startup: capture event loop so background threads can publish events
# ------------------------------------------------------------------

@app.on_event("startup")
async def _on_startup() -> None:
    loop = asyncio.get_running_loop()
    set_running_loop(loop)
    # Recreate the Queue inside the correct event loop
    q: asyncio.Queue = asyncio.Queue()
    set_async_queue(q)
    logger.debug("IPC bridge started; asyncio event loop captured")


# ------------------------------------------------------------------
# WebSocket endpoint
# ------------------------------------------------------------------

@app.websocket("/ws/events")
async def websocket_events(websocket: WebSocket) -> None:
    token = websocket.query_params.get("token", "")
    if not validate_token(token):
        await websocket.close(code=4001)
        return

    ws_manager = get_ws_manager()
    await ws_manager.connect(websocket)

    event_queue = get_async_queue()

    try:
        while True:
            try:
                event = await asyncio.wait_for(event_queue.get(), timeout=1.0)
                await ws_manager.broadcast(event["type"], event["payload"])
            except asyncio.TimeoutError:
                # Send a ping to keep the connection alive
                try:
                    await websocket.send_json({"type": "ping", "payload": {}})
                except Exception:
                    break
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        logger.debug("WebSocket session ended: %s", exc)
    finally:
        await ws_manager.disconnect(websocket)


# ------------------------------------------------------------------
# Server startup
# ------------------------------------------------------------------

def start_bridge(port: int, token: str) -> None:
    """Start the IPC bridge server. Called from the MCP backend __main__."""
    from ipc.auth import set_current_token
    set_current_token(token)

    # Create the asyncio event queue bound to the correct loop
    # (done during startup via on_startup event)
    config = uvicorn.Config(
        app=app,
        host=IPC_BIND_HOST,
        port=port,
        log_level="warning",
        access_log=False,
    )
    server = uvicorn.Server(config)
    server.run()
