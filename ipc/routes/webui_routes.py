"""Web UI route — serves the single-page application with token injection."""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import HTMLResponse, RedirectResponse

from ipc.auth import get_current_token

router = APIRouter()

_STATIC_DIR = Path(__file__).parent.parent.parent / "webui" / "static"


@router.get("/ui", include_in_schema=False)
async def ui_redirect():
    return RedirectResponse(url="/ui/")


@router.get("/ui/", include_in_schema=False)
async def serve_ui():
    """Serve the Web UI with the IPC token injected."""
    html_path = _STATIC_DIR / "index.html"
    if not html_path.exists():
        return HTMLResponse("<h1>Web UI not found</h1>", status_code=404)
    html = html_path.read_text(encoding="utf-8")
    token = get_current_token() or ""
    html = html.replace("__IPC_TOKEN__", token)
    return HTMLResponse(html)
