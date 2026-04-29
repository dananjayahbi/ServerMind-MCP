"""SSH local port-forward routes.

POST /api/v1/tunnel/start   — start a port forward (remote port → local port)
POST /api/v1/tunnel/stop    — stop the active forward
GET  /api/v1/tunnel/status  — return current forward status
"""

from __future__ import annotations

import logging
import select
import socket
import socketserver
import threading
from typing import Any

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from ssh.session_manager import get_manager

logger = logging.getLogger(__name__)
router = APIRouter()

# ---- module-level state -------------------------------------------
_forward_server: _ForwardServer | None = None
_forward_thread: threading.Thread | None = None
_forward_info: dict[str, Any] = {}
_state_lock = threading.Lock()


# ---- Paramiko channel-based forwarder -----------------------------

class _TunnelHandler(socketserver.BaseRequestHandler):
    """Forwards each accepted connection through the SSH transport."""

    def handle(self) -> None:
        transport = self.server.ssh_transport  # type: ignore[attr-defined]
        remote_host = self.server.remote_host  # type: ignore[attr-defined]
        remote_port = self.server.remote_port  # type: ignore[attr-defined]

        try:
            channel = transport.open_channel(
                "direct-tcpip",
                (remote_host, remote_port),
                self.request.getpeername(),
            )
        except Exception as exc:
            logger.error("Tunnel open_channel failed: %s", exc)
            return

        if channel is None:
            logger.error("Tunnel channel is None")
            return

        try:
            while True:
                r, _, _ = select.select([self.request, channel], [], [], 1.0)
                if self.request in r:
                    data = self.request.recv(4096)
                    if not data:
                        break
                    channel.send(data)
                if channel in r:
                    data = channel.recv(4096)
                    if not data:
                        break
                    self.request.send(data)
        finally:
            channel.close()
            self.request.close()


class _ForwardServer(socketserver.ThreadingTCPServer):
    daemon_threads = True
    allow_reuse_address = True

    def __init__(self, server_address, handler, ssh_transport, remote_host, remote_port):
        self.ssh_transport = ssh_transport
        self.remote_host = remote_host
        self.remote_port = remote_port
        super().__init__(server_address, handler)


# ---- REST endpoints -----------------------------------------------

@router.post("/tunnel/start")
async def start_tunnel(
    local_port: int = 8888,
    remote_host: str = "localhost",
    remote_port: int = 8080,
) -> JSONResponse:
    global _forward_server, _forward_thread, _forward_info

    manager = get_manager()
    state = manager.get_state_model()

    if state.state != "CONNECTED":
        return JSONResponse(
            status_code=400,
            content={"success": False, "error": "No active SSH session. Use server_expose first."},
        )

    # Get paramiko transport from manager
    from ssh.session_registry import SessionRegistry
    registry = manager._registry
    active = registry.get_exposed()
    if not active:
        return JSONResponse(status_code=400, content={"success": False, "error": "No exposed session."})

    client = manager._clients.get(active.session_uuid)
    if not client:
        return JSONResponse(status_code=400, content={"success": False, "error": "SSH client not found."})

    transport = client.get_transport()
    if not transport or not transport.is_active():
        return JSONResponse(status_code=400, content={"success": False, "error": "SSH transport not active."})

    with _state_lock:
        # Stop existing forwarder if any
        if _forward_server:
            _forward_server.shutdown()
            _forward_server = None

        try:
            server = _ForwardServer(
                ("127.0.0.1", local_port),
                _TunnelHandler,
                transport,
                remote_host,
                remote_port,
            )
        except OSError as exc:
            return JSONResponse(status_code=400, content={"success": False, "error": str(exc)})

        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()

        _forward_server = server
        _forward_thread = thread
        _forward_info = {
            "local_port": local_port,
            "remote_host": remote_host,
            "remote_port": remote_port,
            "url": f"http://127.0.0.1:{local_port}/",
        }

    logger.info(
        "Tunnel started: 127.0.0.1:%d -> %s:%d (over SSH)",
        local_port, remote_host, remote_port,
    )
    return JSONResponse(content={"success": True, **_forward_info})


@router.post("/tunnel/stop")
async def stop_tunnel() -> JSONResponse:
    global _forward_server, _forward_info

    with _state_lock:
        if _forward_server is None:
            return JSONResponse(content={"success": True, "message": "No tunnel was running."})
        _forward_server.shutdown()
        _forward_server = None
        _forward_info = {}

    return JSONResponse(content={"success": True, "message": "Tunnel stopped."})


@router.get("/tunnel/status")
async def tunnel_status() -> JSONResponse:
    with _state_lock:
        if _forward_server is None:
            return JSONResponse(content={"active": False})
        return JSONResponse(content={"active": True, **_forward_info})
