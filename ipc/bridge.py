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
from ipc.routes import health, logs, profiles, session, settings, terminal
from ipc.routes import tunnel
from ipc.routes import exec as exec_route
from ipc.routes import upload as upload_route
from ipc.routes import workflow_connections as workflow_connections_route
from ipc.websocket import get_ws_manager
from shared.constants import IPC_API_PREFIX, IPC_BIND_HOST

logger = logging.getLogger(__name__)

# Set of currently connected xterm.js WebSocket clients (for terminal injection)
_terminal_ws_clients: set[WebSocket] = set()

app = FastAPI(title="ServerMind MCP IPC Bridge", version="1.0.0", docs_url=None)

# CORS is intentionally restrictive — loopback only
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1",
        "http://localhost",
        "http://127.0.0.1:17432",
        "http://localhost:17432",
        "http://127.0.0.1:17435",
        "http://localhost:17435",
    ],
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type", "X-IPC-Token"],
)


# ------------------------------------------------------------------
# Authentication middleware
# ------------------------------------------------------------------

UNAUTHENTICATED_PATHS = {
    f"{IPC_API_PREFIX}/health",
}


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
app.include_router(settings.router, prefix=IPC_API_PREFIX)
app.include_router(upload_route.router, prefix=IPC_API_PREFIX)
app.include_router(tunnel.router, prefix=IPC_API_PREFIX)
app.include_router(exec_route.router, prefix=IPC_API_PREFIX)
app.include_router(workflow_connections_route.router, prefix=IPC_API_PREFIX)


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
# WebSocket: /ws/terminal/web  (raw PTY for xterm.js)
# ------------------------------------------------------------------

@app.websocket("/ws/terminal/web")
async def websocket_terminal_web(websocket: WebSocket) -> None:
    """Bidirectional raw PTY bridge for xterm.js web terminal."""
    token = websocket.query_params.get("token", "")
    if not validate_token(token):
        await websocket.close(code=4001)
        return

    await websocket.accept()
    _terminal_ws_clients.add(websocket)

    from ssh.session_manager import get_manager as get_ssh_manager
    ssh_manager = get_ssh_manager()
    shell = ssh_manager.get_or_open_web_shell()
    if shell is None:
        await websocket.send_text("\r\nNo active SSH session. Connect a server first.\r\n")
        await websocket.close()
        _terminal_ws_clients.discard(websocket)
        return

    loop = asyncio.get_running_loop()
    output_queue: asyncio.Queue[bytes] = asyncio.Queue()

    def _on_chunk(_cmd_id: str, chunk: str, _stream: str) -> None:
        asyncio.run_coroutine_threadsafe(
            output_queue.put(chunk.encode("utf-8", errors="replace")),
            loop,
        )

    shell.add_output_callback(_on_chunk)

    async def _shell_to_ws() -> None:
        try:
            while True:
                data = await output_queue.get()
                await websocket.send_bytes(data)
        except Exception:
            pass

    async def _ws_to_shell() -> None:
        # xterm.js sends TEXT frames (onData returns strings); handle both
        # text and binary so the WS never unexpectedly closes on input.
        # Special JSON control frames (e.g. resize) are handled here too.
        try:
            while True:
                raw = await websocket.receive()
                msg_type = raw.get("type", "")
                if msg_type == "websocket.disconnect":
                    break
                data: bytes | None = None
                if raw.get("bytes"):
                    data = raw["bytes"]
                elif raw.get("text"):
                    text = raw["text"]
                    # Check for JSON control frame (resize, etc.)
                    if text.startswith("{"):
                        try:
                            import json as _json
                            ctrl = _json.loads(text)
                            if ctrl.get("type") == "resize":
                                shell.resize(int(ctrl.get("cols", 80)), int(ctrl.get("rows", 24)))
                        except Exception:
                            pass
                        continue
                    data = text.encode("utf-8")
                if data and shell.is_open():
                    # Strip null keepalive bytes sent by the frontend
                    data = data.replace(b"\x00", b"")
                    if data:
                        shell.send_input(data)
        except WebSocketDisconnect:
            pass
        except Exception:
            pass

    send_task = asyncio.create_task(_shell_to_ws())
    recv_task = asyncio.create_task(_ws_to_shell())
    try:
        done, pending = await asyncio.wait(
            [send_task, recv_task],
            return_when=asyncio.FIRST_COMPLETED,
        )
        for t in pending:
            t.cancel()
    finally:
        shell.remove_output_callback(_on_chunk)
        _terminal_ws_clients.discard(websocket)


# ------------------------------------------------------------------
# WebSocket: /ws/terminal/workflow/{session_uuid}  (workflow sessions)
# ------------------------------------------------------------------

@app.websocket("/ws/terminal/workflow/{session_uuid}")
async def websocket_terminal_workflow(websocket: WebSocket, session_uuid: str) -> None:
    """Bidirectional raw PTY bridge for workflow connection terminals."""
    token = websocket.query_params.get("token", "")
    if not validate_token(token):
        await websocket.close(code=4001)
        return

    await websocket.accept()

    # Try workflow pool first, then fall back to MCP session manager
    from ssh.workflow_pool import get_pool as get_wf_pool
    from ssh.session_manager import get_manager as get_ssh_manager

    pool = get_wf_pool()
    ssh_manager = get_ssh_manager()

    state = ssh_manager.get_state_model()
    if state.session_uuid == session_uuid:
        shell = ssh_manager.get_or_open_web_shell()
    else:
        shell = pool.get_or_open_web_shell(session_uuid)

    if shell is None:
        await websocket.send_text(
            f"\r\nNo connected session for {session_uuid}.\r\n"
        )
        await websocket.close()
        return

    loop = asyncio.get_running_loop()
    output_queue: asyncio.Queue[bytes] = asyncio.Queue()

    def _on_chunk(_cmd_id: str, chunk: str, _stream: str) -> None:
        asyncio.run_coroutine_threadsafe(
            output_queue.put(chunk.encode("utf-8", errors="replace")),
            loop,
        )

    shell.add_output_callback(_on_chunk)

    async def _shell_to_ws() -> None:
        try:
            while True:
                data = await output_queue.get()
                await websocket.send_bytes(data)
        except Exception:
            pass

    async def _ws_to_shell() -> None:
        try:
            while True:
                raw = await websocket.receive()
                msg_type = raw.get("type", "")
                if msg_type == "websocket.disconnect":
                    break
                data: bytes | None = None
                if raw.get("bytes"):
                    data = raw["bytes"]
                elif raw.get("text"):
                    text = raw["text"]
                    if text.startswith("{"):
                        try:
                            import json as _json
                            ctrl = _json.loads(text)
                            if ctrl.get("type") == "resize":
                                shell.resize(
                                    int(ctrl.get("cols", 80)), int(ctrl.get("rows", 24))
                                )
                        except Exception:
                            pass
                        continue
                    data = text.encode("utf-8")
                if data and shell.is_open():
                    data = data.replace(b"\x00", b"")
                    if data:
                        shell.send_input(data)
        except WebSocketDisconnect:
            pass
        except Exception:
            pass

    send_task = asyncio.create_task(_shell_to_ws())
    recv_task = asyncio.create_task(_ws_to_shell())
    try:
        done, pending = await asyncio.wait(
            [send_task, recv_task],
            return_when=asyncio.FIRST_COMPLETED,
        )
        for t in pending:
            t.cancel()
    finally:
        shell.remove_output_callback(_on_chunk)


@app.post(f"{IPC_API_PREFIX}/session/terminal/inject")
async def inject_terminal_output(request: Request) -> JSONResponse:
    """Inject text directly into all connected xterm.js terminal clients."""
    body = await request.json()
    text = body.get("text", "")
    if not text:
        return JSONResponse({"ok": True, "clients": 0})
    data = text.encode("utf-8", errors="replace")
    dead: set[WebSocket] = set()
    for ws in list(_terminal_ws_clients):
        try:
            await ws.send_bytes(data)
        except Exception:
            dead.add(ws)
    _terminal_ws_clients.difference_update(dead)
    return JSONResponse({"ok": True, "clients": len(_terminal_ws_clients)})

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
