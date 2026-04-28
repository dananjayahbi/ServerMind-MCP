"""
IPC REST and WebSocket client for the GUI.

Connects to the MCP backend at 127.0.0.1:17432.
Reads the IPC token from runtime.json in the app data directory.
"""

from __future__ import annotations

import json
import logging
import threading
from pathlib import Path
from typing import Any, Callable

import httpx

logger = logging.getLogger(__name__)

_BASE_URL = "http://127.0.0.1:17432"
_WS_URL = "ws://127.0.0.1:17432/ws/events"


class IPCClient:
    """HTTP + WebSocket client for communicating with the MCP backend bridge."""

    def __init__(self) -> None:
        self._token: str | None = None
        self._ws_thread: threading.Thread | None = None
        self._ws_running = False
        self._event_callbacks: list[Callable[[dict], None]] = []
        self._http: httpx.Client = httpx.Client(base_url=_BASE_URL, timeout=10.0)

    # ------------------------------------------------------------------
    # Token management
    # ------------------------------------------------------------------

    def load_token(self, runtime_path: Path) -> bool:
        """Load IPC token from runtime.json. Returns True if successful."""
        try:
            data = json.loads(runtime_path.read_text(encoding="utf-8"))
            self._token = data.get("ipc_token") or data.get("token")
            if not self._token:
                logger.warning("runtime.json has no token field")
                return False
            self._http = httpx.Client(
                base_url=_BASE_URL,
                timeout=10.0,
                headers={"X-IPC-Token": self._token},
            )
            return True
        except Exception as exc:
            logger.debug("Could not load runtime token: %s", exc)
            return False

    @property
    def has_token(self) -> bool:
        return self._token is not None

    # ------------------------------------------------------------------
    # REST helpers
    # ------------------------------------------------------------------

    def _get(self, path: str) -> dict | None:
        try:
            resp = self._http.get(path)
            resp.raise_for_status()
            return resp.json()
        except Exception as exc:
            logger.debug("GET %s failed: %s", path, exc)
            return None

    def _post(self, path: str, payload: dict | None = None) -> dict | None:
        try:
            resp = self._http.post(path, json=payload or {})
            resp.raise_for_status()
            return resp.json()
        except Exception as exc:
            logger.debug("POST %s failed: %s", path, exc)
            return None

    # ------------------------------------------------------------------
    # API methods
    # ------------------------------------------------------------------

    def health(self) -> dict | None:
        # Health endpoint needs no auth header
        try:
            resp = httpx.get(f"{_BASE_URL}/api/v1/health", timeout=3.0)
            resp.raise_for_status()
            return resp.json()
        except Exception:
            return None

    def get_session_status(self) -> dict | None:
        return self._get("/api/v1/session/status")

    def expose(self, profile_id: str) -> dict | None:
        return self._post("/api/v1/session/expose", {"profile_id": profile_id})

    def disconnect(self) -> dict | None:
        return self._post("/api/v1/session/disconnect")

    def get_profiles(self) -> list[dict] | None:
        result = self._get("/api/v1/profiles")
        if isinstance(result, list):
            return result
        return None

    def get_logs(self, limit: int = 100) -> list[dict] | None:
        result = self._get(f"/api/v1/logs?limit={limit}")
        if isinstance(result, list):
            return result
        return None

    def send_terminal_input(self, text: str) -> dict | None:
        return self._post("/api/v1/terminal/send", {"command_text": text})

    # ------------------------------------------------------------------
    # Profile CRUD
    # ------------------------------------------------------------------

    def create_profile(self, data: dict) -> dict | None:
        """POST /api/v1/profiles  — create a new server profile."""
        try:
            resp = self._http.post("/api/v1/profiles", json=data)
            resp.raise_for_status()
            return resp.json()
        except Exception as exc:
            logger.debug("POST /profiles failed: %s", exc)
            return None

    def update_profile(self, profile_id: str, data: dict) -> dict | None:
        """PUT /api/v1/profiles/{id}  — update an existing profile."""
        try:
            resp = self._http.put(f"/api/v1/profiles/{profile_id}", json=data)
            resp.raise_for_status()
            return resp.json()
        except Exception as exc:
            logger.debug("PUT /profiles/%s failed: %s", profile_id, exc)
            return None

    def delete_profile(self, profile_id: str) -> bool:
        """DELETE /api/v1/profiles/{id}  — delete a profile. Returns True on success."""
        try:
            resp = self._http.delete(f"/api/v1/profiles/{profile_id}")
            resp.raise_for_status()
            return True
        except Exception as exc:
            logger.debug("DELETE /profiles/%s failed: %s", profile_id, exc)
            return False

    # ------------------------------------------------------------------
    # WebSocket
    # ------------------------------------------------------------------

    def add_event_callback(self, cb: Callable[[dict], None]) -> None:
        self._event_callbacks.append(cb)

    def start_ws_listener(self) -> None:
        """Start the WebSocket listener in a background thread."""
        if self._ws_running:
            return
        self._ws_running = True
        self._ws_thread = threading.Thread(
            target=self._ws_loop,
            name="ipc-ws-listener",
            daemon=True,
        )
        self._ws_thread.start()

    def stop_ws_listener(self) -> None:
        self._ws_running = False

    def _ws_loop(self) -> None:
        import websocket  # websocket-client package

        while self._ws_running:
            try:
                ws_url = f"{_WS_URL}?token={self._token}" if self._token else _WS_URL
                ws = websocket.WebSocketApp(
                    ws_url,
                    on_message=self._on_ws_message,
                    on_error=lambda ws, err: logger.debug("WS error: %s", err),
                    on_close=lambda ws, code, msg: logger.debug("WS closed: %s", msg),
                )
                ws.run_forever(ping_interval=30)
            except Exception as exc:
                logger.debug("WS loop exception: %s", exc)
            if self._ws_running:
                import time
                time.sleep(3)  # Reconnect after 3s

    def _on_ws_message(self, ws, raw: str) -> None:
        try:
            event = json.loads(raw)
            for cb in self._event_callbacks:
                cb(event)
        except Exception as exc:
            logger.debug("WS message parse error: %s", exc)

    def close(self) -> None:
        self._ws_running = False
        self._http.close()
