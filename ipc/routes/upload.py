"""Upload a file from the MCP server machine to the remote SSH host via SFTP."""

from __future__ import annotations

import os
import tempfile

from fastapi import APIRouter, File, Form, UploadFile
from fastapi.responses import JSONResponse

from ssh.session_manager import get_manager

router = APIRouter()


@router.post("/upload")
async def upload_file_to_server(
    file: UploadFile = File(...),
    remote_path: str = Form(...),
) -> JSONResponse:
    """Receive a file via HTTP multipart and upload it to the remote server via SFTP."""
    manager = get_manager()
    state = manager.get_state_model()

    if state.state != "CONNECTED":
        return JSONResponse(
            status_code=400,
            content={
                "success": False,
                "error": (
                    f"Session is not CONNECTED (current state: {state.state}). "
                    "Connect to a server first."
                ),
            },
        )

    content = await file.read()
    suffix = os.path.splitext(file.filename or "upload")[1]

    # Write to a temp file, then hand off to the SFTP manager
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(content)
        tmp_path = tmp.name

    try:
        result = manager.upload_file(tmp_path, remote_path)
        return JSONResponse(content=result)
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
