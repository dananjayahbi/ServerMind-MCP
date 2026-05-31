"""Session management endpoints — supports multiple concurrent sessions."""

from __future__ import annotations

import logging
from typing import List

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

from config.engine import get_engine
from ipc.models import (
    DisconnectRequest,
    DisconnectResponse,
    ExposeRequest,
    ExposeResponse,
    SessionStatusResponse,
)
from shared.exceptions import ProfileNotFoundError
from ssh.session_manager import get_manager

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/session/status", response_model=SessionStatusResponse)
async def get_session_status() -> SessionStatusResponse:
    """Return the first active session status (backward compat)."""
    model = get_manager().get_state_model()
    return SessionStatusResponse(**model.to_dict())


@router.get("/sessions", response_model=List[SessionStatusResponse])
async def list_sessions() -> List[SessionStatusResponse]:
    """Return all currently active (non-DISCONNECTED) session states."""
    models = get_manager().get_state_model_all()
    return [SessionStatusResponse(**m.to_dict()) for m in models]


@router.post("/session/expose", response_model=ExposeResponse)
async def expose_session(request: ExposeRequest) -> ExposeResponse:
    """Expose a server profile. Multiple servers can be exposed simultaneously."""
    engine = get_engine()
    try:
        profile = engine.get_profile(request.profile_id)
    except ProfileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    manager = get_manager()
    try:
        session_uuid = manager.expose(profile, passphrase=request.passphrase)
    except Exception as exc:
        logger.exception("Failed to initiate exposure")
        raise HTTPException(status_code=500, detail=str(exc))

    return ExposeResponse(
        session_uuid=session_uuid,
        state="CONNECTING",
        message=f"Connecting to {profile.hostname}...",
    )


@router.post("/session/disconnect", response_model=DisconnectResponse)
async def disconnect_session(request: DisconnectRequest) -> DisconnectResponse:
    """Disconnect a specific session (or first active if session_uuid is omitted)."""
    manager = get_manager()

    if request.session_uuid:
        entry = manager._registry.get(request.session_uuid)
        if not entry or entry.state == "DISCONNECTED":
            raise HTTPException(status_code=404, detail=f"No active session: {request.session_uuid}")
        session_uuid = request.session_uuid
        manager.disconnect(session_uuid)
    else:
        # Backward compat: disconnect first active session
        active = manager.get_state_model()
        if active.state == "DISCONNECTED":
            raise HTTPException(status_code=404, detail="No active session to disconnect.")
        session_uuid = active.session_uuid
        manager.disconnect_active()

    return DisconnectResponse(
        session_uuid=session_uuid,
        message="Session disconnected.",
    )
