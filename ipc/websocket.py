"""WebSocket manager and event dispatcher for the IPC bridge."""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from fastapi import WebSocket, WebSocketDisconnect

from ipc.auth import validate_token

logger = logging.getLogger(__name__)


class WebSocketManager:
    """Manages connected WebSocket clients and broadcasts events."""

    def __init__(self) -> None:
        self._clients: list[WebSocket] = []
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._clients.append(websocket)
        logger.debug("WebSocket client connected. Total: %d", len(self._clients))

    async def disconnect(self, websocket: WebSocket) -> None:
        async with self._lock:
            if websocket in self._clients:
                self._clients.remove(websocket)
        logger.debug("WebSocket client disconnected. Total: %d", len(self._clients))

    async def broadcast(self, event_type: str, payload: Any) -> None:
        """Send an event to all connected clients."""
        message = json.dumps({"type": event_type, "payload": payload})
        dead: list[WebSocket] = []
        async with self._lock:
            clients = list(self._clients)
        for ws in clients:
            try:
                await ws.send_text(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            await self.disconnect(ws)

    async def serve(
        self, websocket: WebSocket, event_queue: asyncio.Queue
    ) -> None:
        """Main handler for a WebSocket connection. Reads from event_queue and sends."""
        try:
            while True:
                # Wait for an event with a short timeout to allow disconnect detection
                try:
                    event = await asyncio.wait_for(event_queue.get(), timeout=0.5)
                    if event is None:
                        break
                    await self.broadcast(event["type"], event["payload"])
                except asyncio.TimeoutError:
                    # Ping to keep connection alive
                    pass
        except WebSocketDisconnect:
            pass
        except Exception as exc:
            logger.warning("WebSocket serve error: %s", exc)
        finally:
            await self.disconnect(websocket)


# Module-level singleton
_ws_manager = WebSocketManager()


def get_ws_manager() -> WebSocketManager:
    return _ws_manager
