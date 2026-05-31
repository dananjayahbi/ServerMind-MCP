"""REST endpoints for managing workflow server connections.

These endpoints allow the UI to:
- List all active workflow connections (plus the MCP-exposed session).
- Connect an additional server specifically for workflow execution.
- Disconnect a workflow server.
- Execute commands and upload files on a specific session.
"""

from __future__ import annotations

import asyncio
import time
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from config.engine import get_engine
from ipc.routes.upload import (
    _make_progress_callback,
    _register_progress,
    _schedule_cleanup,
)
from shared.constants import Actor, ExecMode
from shared.exceptions import ProfileNotFoundError
from shared.models import CommandRequest
from ssh.session_manager import get_manager
from ssh.workflow_pool import get_pool

router = APIRouter()


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------

class WorkflowConnectRequest(BaseModel):
    profile_id: str
    passphrase: str | None = None


class WorkflowExecRequest(BaseModel):
    command: str
    timeout_sec: int = 300


class WorkflowUploadLocalRequest(BaseModel):
    local_path: str
    remote_path: str
    upload_id: str = ""


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/workflow-connections")
async def list_workflow_connections() -> JSONResponse:
    """Return all workflow pool connections plus the MCP session (if active)."""
    pool = get_pool()
    connections: list[dict] = pool.list_connections()

    # Prepend the MCP-exposed session so the UI can treat it as "already connected".
    manager = get_manager()
    state = manager.get_state_model()
    if state.state not in ("DISCONNECTED",) and state.session_uuid:
        profile = None
        if state.profile_id:
            try:
                profile = get_engine().get_profile(state.profile_id)
            except Exception:
                pass
        mcp_entry = {
            "session_uuid": state.session_uuid,
            "profile_id": state.profile_id,
            "display_name": (
                profile.display_name if profile else (state.profile_id or "MCP Session")
            ),
            "hostname": profile.hostname if profile else "",
            "username": profile.username if profile else "",
            "state": state.state,
            "connected_at": state.connected_at,
            "error": None,
            "is_mcp_session": True,
        }
        connections = [mcp_entry] + connections

    return JSONResponse(connections)


@router.post("/workflow-connections")
async def connect_workflow_server(req: WorkflowConnectRequest) -> JSONResponse:
    """Connect a server for workflow execution (non-blocking)."""
    try:
        profile = get_engine().get_profile(req.profile_id)
    except ProfileNotFoundError as exc:
        return JSONResponse(status_code=404, content={"error": str(exc)})

    pool = get_pool()
    session_uuid = pool.connect(profile, passphrase=req.passphrase)
    return JSONResponse(
        {
            "session_uuid": session_uuid,
            "state": "CONNECTING",
            "display_name": profile.display_name,
            "hostname": profile.hostname,
            "is_mcp_session": False,
        },
        status_code=202,
    )


@router.delete("/workflow-connections/{session_uuid}")
async def disconnect_workflow_server(session_uuid: str) -> JSONResponse:
    """Disconnect and remove a workflow server connection."""
    get_pool().disconnect(session_uuid)
    return JSONResponse({"ok": True, "session_uuid": session_uuid})


@router.get("/workflow-connections/{session_uuid}/status")
async def workflow_connection_status(session_uuid: str) -> JSONResponse:
    """Get current status of a specific workflow connection."""
    pool = get_pool()
    entry = pool.get_entry(session_uuid)
    if not entry:
        return JSONResponse(status_code=404, content={"error": "Connection not found"})
    return JSONResponse(entry.to_dict())


@router.post("/workflow-connections/{session_uuid}/exec")
async def workflow_exec(session_uuid: str, req: WorkflowExecRequest) -> JSONResponse:
    """Execute a shell command on a specific workflow connection."""
    command_id = str(uuid.uuid4())
    request = CommandRequest(
        command_id=command_id,
        command_text=req.command,
        actor=Actor.OPERATOR,
        execution_mode=ExecMode.EXEC,
        timeout_sec=req.timeout_sec,
        submitted_at=datetime.now(timezone.utc).isoformat(),
    )

    loop = asyncio.get_event_loop()

    # Route to MCP session manager or workflow pool
    manager = get_manager()
    state = manager.get_state_model()
    if state.session_uuid == session_uuid and state.state == "CONNECTED":
        result = await loop.run_in_executor(
            None, lambda: manager.execute_command(request)
        )
    else:
        pool = get_pool()
        entry = pool.get_entry(session_uuid)
        if not entry:
            return JSONResponse(
                status_code=404,
                content={"error": "SESSION_NOT_FOUND", "stdout": "", "stderr": "Connection not found"},
            )
        if entry.state != "CONNECTED":
            return JSONResponse(
                status_code=400,
                content={
                    "error": "SESSION_NOT_CONNECTED",
                    "stdout": "",
                    "stderr": f"Session is not CONNECTED (state: {entry.state})",
                },
            )
        result = await loop.run_in_executor(
            None, lambda: pool.execute_command(session_uuid, request)
        )

    return JSONResponse(
        {
            "stdout": result.stdout,
            "stderr": result.stderr,
            "exit_code": result.exit_code,
            "status": result.status,
        }
    )


@router.post("/workflow-connections/{session_uuid}/upload-local")
async def workflow_upload_local(
    session_uuid: str, req: WorkflowUploadLocalRequest
) -> JSONResponse:
    """Upload a local file to a specific workflow connection via SFTP pipelining."""
    import os

    if not req.local_path or not os.path.isabs(req.local_path):
        return JSONResponse(
            status_code=400,
            content={"success": False, "error": "local_path must be an absolute path"},
        )
    if not req.remote_path:
        return JSONResponse(
            status_code=400,
            content={"success": False, "error": "remote_path is required"},
        )

    t_start = time.monotonic()
    progress_cb = _make_progress_callback(req.upload_id, t_start)
    loop = asyncio.get_event_loop()

    # Route to MCP session manager or workflow pool
    manager = get_manager()
    state = manager.get_state_model()
    if state.session_uuid == session_uuid and state.state == "CONNECTED":
        result = await loop.run_in_executor(
            None,
            lambda: manager.upload_file(
                req.local_path, req.remote_path, progress_callback=progress_cb
            ),
        )
    else:
        pool = get_pool()
        entry = pool.get_entry(session_uuid)
        if not entry:
            return JSONResponse(
                status_code=404,
                content={"success": False, "error": "Connection not found"},
            )
        if entry.state != "CONNECTED":
            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "error": f"Session is not CONNECTED (state: {entry.state})",
                },
            )
        result = await loop.run_in_executor(
            None,
            lambda: pool.upload_file(
                session_uuid,
                req.local_path,
                req.remote_path,
                progress_callback=progress_cb,
            ),
        )

    elapsed = time.monotonic() - t_start

    # Mark progress as complete
    if req.upload_id:
        _register_progress(
            req.upload_id,
            {
                "bytes_sent": result.get("bytes_transferred", 0),
                "total_bytes": result.get("bytes_transferred", 0),
                "throughput_kbps": (
                    round(result.get("bytes_transferred", 0) / 1024 / elapsed, 1)
                    if elapsed > 0
                    else 0
                ),
                "done": True,
            },
        )
        _schedule_cleanup(req.upload_id)

    if not result.get("success"):
        return JSONResponse(status_code=500, content=result)

    bt = result.get("bytes_transferred", 0)
    return JSONResponse(
        {
            **result,
            "elapsed_seconds": round(elapsed, 2),
            "throughput_kbps": round(bt / 1024 / elapsed, 1) if elapsed > 0 else 0,
        }
    )
