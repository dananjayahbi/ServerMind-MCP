"""
Integration tests for the IPC bridge.

These tests start the FastAPI bridge in a background thread and
exercise the REST endpoints via httpx.

Requires: no active MCP process (uses a fresh token each run).
"""

import threading
import time
import pytest
import httpx

from ipc.auth import generate_token, set_current_token, write_runtime_state
from ipc.bridge import create_app

TEST_PORT = 17499  # Use a different port to avoid conflicts


@pytest.fixture(scope="module")
def bridge_server(tmp_path_factory):
    """Start IPC bridge on test port, yield base URL, then stop."""
    import asyncio
    import uvicorn

    token = generate_token()
    set_current_token(token)

    app = create_app(token=token)

    config = uvicorn.Config(app, host="127.0.0.1", port=TEST_PORT, log_level="critical")
    server = uvicorn.Server(config)

    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    time.sleep(1.0)  # Give server time to start

    yield f"http://127.0.0.1:{TEST_PORT}", token

    server.should_exit = True
    time.sleep(0.5)


class TestIPCBridgeHealth:

    def test_health_endpoint_returns_ok(self, bridge_server):
        base_url, token = bridge_server
        resp = httpx.get(f"{base_url}/api/v1/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("status") == "ok"

    def test_health_requires_no_auth(self, bridge_server):
        base_url, token = bridge_server
        # Should work without token
        resp = httpx.get(f"{base_url}/api/v1/health")
        assert resp.status_code == 200


class TestIPCBridgeAuth:

    def test_authenticated_request_succeeds(self, bridge_server):
        base_url, token = bridge_server
        resp = httpx.get(
            f"{base_url}/api/v1/session/status",
            headers={"X-IPC-Token": token},
        )
        assert resp.status_code == 200

    def test_missing_token_returns_401(self, bridge_server):
        base_url, token = bridge_server
        resp = httpx.get(f"{base_url}/api/v1/session/status")
        assert resp.status_code == 401

    def test_invalid_token_returns_401(self, bridge_server):
        base_url, token = bridge_server
        resp = httpx.get(
            f"{base_url}/api/v1/session/status",
            headers={"X-IPC-Token": "wrong-token"},
        )
        assert resp.status_code == 401


class TestIPCBridgeSession:

    def test_session_status_returns_disconnected(self, bridge_server):
        base_url, token = bridge_server
        resp = httpx.get(
            f"{base_url}/api/v1/session/status",
            headers={"X-IPC-Token": token},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("state") == "DISCONNECTED"

    def test_profiles_endpoint_returns_list(self, bridge_server):
        base_url, token = bridge_server
        resp = httpx.get(
            f"{base_url}/api/v1/profiles",
            headers={"X-IPC-Token": token},
        )
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_logs_endpoint_returns_list(self, bridge_server):
        base_url, token = bridge_server
        resp = httpx.get(
            f"{base_url}/api/v1/logs",
            headers={"X-IPC-Token": token},
        )
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)
