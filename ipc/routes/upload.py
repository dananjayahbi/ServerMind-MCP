"""Upload a file from the MCP server machine to the remote SSH host via SFTP.

The transfer uses SFTP write pipelining (the same technique WinSCP employs),
which is significantly faster than a plain sequential ``sftp.put()`` on links
with any noticeable round-trip latency.  See :mod:`ssh.sftp_transfer` for the
technical details.

Two endpoints are provided:

* ``POST /upload``        — HTTP multipart; useful when the file is sent from a
  remote browser or external tool.
* ``POST /upload-local``  — JSON body with a local filesystem path; used by the
  Next.js workflow runner (co-located on the same machine) to avoid the overhead
  of reading the file into memory, shipping it over HTTP, and writing a second
  temp copy before the SFTP transfer begins.

Both endpoints accept an optional ``upload_id`` field.  When supplied, the
transfer progress is tracked in memory and can be polled at
``GET /upload/{upload_id}/progress``.
"""

from __future__ import annotations

import os
import tempfile
import threading
import time
from typing import Dict

from fastapi import APIRouter, File, Form, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from ssh.session_manager import get_manager

router = APIRouter()

# ── Upload progress tracking ─────────────────────────────────────────────────
# Maps upload_id → progress snapshot dict.  Entries are cleaned up ~60 s after
# the upload completes so the poller always receives the final state.
_upload_progress: Dict[str, dict] = {}
_progress_lock = threading.Lock()


def _register_progress(upload_id: str, state: dict) -> None:
    if not upload_id:
        return
    with _progress_lock:
        _upload_progress[upload_id] = state


def _schedule_cleanup(upload_id: str, delay_sec: float = 60.0) -> None:
    """Remove the progress entry *delay_sec* seconds after upload completion."""
    if not upload_id:
        return

    def _clean() -> None:
        time.sleep(delay_sec)
        with _progress_lock:
            _upload_progress.pop(upload_id, None)

    threading.Thread(target=_clean, daemon=True).start()


def _make_progress_callback(upload_id: str, t_start: float):
    """Return a ``(bytes_sent, total_bytes) → None`` callback that updates the
    progress registry.  Returns *None* when *upload_id* is empty (no tracking).
    """
    if not upload_id:
        return None

    def cb(bytes_sent: int, total_bytes: int) -> None:
        elapsed = time.monotonic() - t_start
        throughput_kbps = round(bytes_sent / 1024 / elapsed, 1) if elapsed > 0 else 0
        _register_progress(upload_id, {
            "bytes_sent": bytes_sent,
            "total_bytes": total_bytes,
            "throughput_kbps": throughput_kbps,
            "done": False,
        })

    return cb


def _check_connected():
    manager = get_manager()
    state = manager.get_state_model()
    if state.state != "CONNECTED":
        return None, JSONResponse(
            status_code=400,
            content={
                "success": False,
                "error": (
                    f"Session is not CONNECTED (current state: {state.state}). "
                    "Connect to a server first."
                ),
            },
        )
    return manager, None


# ── Multipart upload endpoint ─────────────────────────────────────────────────

@router.post("/upload")
async def upload_file_to_server(
    file: UploadFile = File(...),
    remote_path: str = Form(...),
    upload_id: str = Form(default=""),
) -> JSONResponse:
    """Receive a file via HTTP multipart and upload it to the remote server via SFTP.

    Returns transfer statistics (bytes transferred, elapsed seconds, average
    throughput in KB/s) alongside the usual success/error fields.

    Pass an optional ``upload_id`` form field to enable progress tracking via
    ``GET /upload/{upload_id}/progress``.
    """
    manager, err = _check_connected()
    if err:
        return err

    content = await file.read()
    suffix = os.path.splitext(file.filename or "upload")[1]

    # Write to a temp file, then hand the path to the SFTP manager so the
    # pipelined transfer can read it in large sequential chunks.
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(content)
        tmp_path = tmp.name

    try:
        t_start = time.monotonic()
        progress_cb = _make_progress_callback(upload_id, t_start)
        result = manager.upload_file(tmp_path, remote_path, progress_callback=progress_cb)
        elapsed = time.monotonic() - t_start

        if result.get("success"):
            bytes_transferred = result.get("bytes_transferred", 0)
            throughput_kbps = round(bytes_transferred / 1024 / elapsed, 1) if elapsed > 0 else 0
            result["elapsed_seconds"] = round(elapsed, 3)
            result["throughput_kbps"] = throughput_kbps
            _register_progress(upload_id, {
                "bytes_sent": bytes_transferred,
                "total_bytes": bytes_transferred,
                "throughput_kbps": throughput_kbps,
                "done": True,
            })

        _schedule_cleanup(upload_id)
        return JSONResponse(content=result)
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


# ── Local-path upload endpoint ────────────────────────────────────────────────

class LocalUploadRequest(BaseModel):
    local_path: str
    remote_path: str
    upload_id: str = ""


@router.post("/upload-local")
async def upload_local_file(req: LocalUploadRequest) -> JSONResponse:
    """Upload a file that already exists on the local filesystem.

    This is the preferred endpoint for callers that have the file on disk on
    the same machine as the MCP server (e.g. the Next.js workflow runner).
    Compared with the multipart ``/upload`` endpoint it avoids:

    * Reading the entire file into memory in the caller,
    * Shipping all those bytes over HTTP (localhost, but still non-trivial for
      large archives), and
    * Writing a second temporary copy before the SFTP transfer begins.

    Supply ``upload_id`` to enable real-time progress polling via
    ``GET /upload/{upload_id}/progress``.
    """
    manager, err = _check_connected()
    if err:
        return err

    if not os.path.isfile(req.local_path):
        return JSONResponse(
            status_code=400,
            content={"success": False, "error": f"File not found: {req.local_path}"},
        )

    t_start = time.monotonic()
    progress_cb = _make_progress_callback(req.upload_id, t_start)
    result = manager.upload_file(req.local_path, req.remote_path, progress_callback=progress_cb)
    elapsed = time.monotonic() - t_start

    if result.get("success"):
        bytes_transferred = result.get("bytes_transferred", 0)
        throughput_kbps = round(bytes_transferred / 1024 / elapsed, 1) if elapsed > 0 else 0
        result["elapsed_seconds"] = round(elapsed, 3)
        result["throughput_kbps"] = throughput_kbps
        _register_progress(req.upload_id, {
            "bytes_sent": bytes_transferred,
            "total_bytes": bytes_transferred,
            "throughput_kbps": throughput_kbps,
            "done": True,
        })

    _schedule_cleanup(req.upload_id)
    return JSONResponse(content=result)


# ── Progress polling endpoint ─────────────────────────────────────────────────

@router.get("/upload/{upload_id}/progress")
async def get_upload_progress(upload_id: str) -> JSONResponse:
    """Return a progress snapshot for an in-flight (or recently completed) upload.

    Response shape::

        {
          "bytes_sent":      1048576,
          "total_bytes":     10485760,
          "throughput_kbps": 4096.0,
          "done":            false
        }

    Returns 404 when the *upload_id* is unknown or has been cleaned up.
    """
    with _progress_lock:
        data = _upload_progress.get(upload_id)
    if data is None:
        return JSONResponse(
            status_code=404,
            content={"error": "Upload not found or already cleaned up"},
        )
    return JSONResponse(content=data)
