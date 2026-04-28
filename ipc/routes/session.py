"""Session management endpoints."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, status

from config.engine import get_engine
from ipc.auth import validate_token
from ipc.models import (
    DisconnectResponse,
    ExposeRequest,
    ExposeResponse,
    SessionStatusResponse,
)
from shared.exceptions import (
    ProfileNotFoundError,
    SessionAlreadyExposedError,
)
from ssh.session_manager import get_manager

logger = logging.getLogger(__name__)
router = APIRouter()


def _require_auth(authorization: str | None = None) -> None:
    """Dependency: validates Bearer token from Authorization header."""
    from fastapi import Header
    pass  # Handled at middleware level in bridge.py


@router.get("/session/status", response_model=SessionStatusResponse)
async def get_session_status() -> SessionStatusResponse:
    model = get_manager().get_state_model()
    return SessionStatusResponse(**model.to_dict())


@router.post("/session/expose", response_model=ExposeResponse)
async def expose_session(request: ExposeRequest) -> ExposeResponse:
    engine = get_engine()
    try:
        profile = engine.get_profile(request.profile_id)
    except ProfileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    manager = get_manager()
    try:
        session_uuid = manager.expose(profile)
    except SessionAlreadyExposedError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    except Exception as exc:
        logger.exception("Failed to initiate exposure")
        raise HTTPException(status_code=500, detail=str(exc))

    return ExposeResponse(
        session_uuid=session_uuid,
        state="CONNECTING",
        message=f"Connecting to {profile.hostname}...",
    )


@router.post("/session/disconnect", response_model=DisconnectResponse)
async def disconnect_session() -> DisconnectResponse:
    manager = get_manager()
    active = manager.get_state_model()
    if active.state == "DISCONNECTED":
        raise HTTPException(status_code=404, detail="No active session to disconnect.")

    session_uuid = active.session_uuid
    manager.disconnect_active()
    return DisconnectResponse(
        session_uuid=session_uuid,
        message="Session disconnected.",
    )
