"""Profile management endpoints (list, create, update, delete, key upload)."""

import uuid
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import JSONResponse

from config.engine import get_engine
from ipc.models import CreateProfileRequest, ProfileResponse, UpdateProfileRequest
from shared.exceptions import ProfileInUseError, ProfileNotFoundError
from shared.models import ServerProfile

router = APIRouter()

# Directory where uploaded PPK/SSH key files are stored
_KEYS_DIR = Path.home() / ".servermind" / "keys"


@router.post("/profiles/upload-key")
async def upload_key_file(file: UploadFile = File(...)) -> JSONResponse:
    """Upload a PPK or SSH private key file. Returns the saved file path."""
    _KEYS_DIR.mkdir(parents=True, exist_ok=True)
    # Use a UUID prefix to avoid filename collisions
    safe_name = f"{uuid.uuid4().hex}_{Path(file.filename or 'key').name}"
    dest = _KEYS_DIR / safe_name
    content = await file.read()
    dest.write_bytes(content)
    return JSONResponse({"path": str(dest)})


@router.get("/profiles", response_model=list[ProfileResponse])
async def list_profiles() -> list[ProfileResponse]:
    profiles = get_engine().list_profiles()
    return [ProfileResponse(**p.to_dict()) for p in profiles]


@router.post("/profiles", response_model=ProfileResponse, status_code=201)
async def create_profile(req: CreateProfileRequest) -> ProfileResponse:
    profile = ServerProfile(
        display_name=req.display_name,
        hostname=req.hostname,
        port=req.port,
        username=req.username,
        ppk_file_path=req.ppk_file_path or "",
        auth_method=req.auth_method,
        password=req.password or "",
        sudo_password=req.sudo_password or "",
        notes=req.notes or "",
        keepalive_transport_interval_sec=req.keepalive_transport_interval_sec,
        keepalive_app_interval_sec=req.keepalive_app_interval_sec,
        connection_timeout_sec=req.connection_timeout_sec,
        max_reconnect_attempts=req.max_reconnect_attempts,
        reconnect_base_delay_sec=req.reconnect_base_delay_sec,
    )
    created = get_engine().create_profile(profile)
    from ipc.cache_writer import refresh_profiles_cache
    refresh_profiles_cache()
    return ProfileResponse(**created.to_dict())


@router.put("/profiles/{profile_id}", response_model=ProfileResponse)
async def update_profile(profile_id: str, req: UpdateProfileRequest) -> ProfileResponse:
    engine = get_engine()
    try:
        existing = engine.get_profile(profile_id)
    except ProfileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Profile '{profile_id}' not found")

    # Apply partial updates
    updates = req.model_dump(exclude_none=True)
    for key, value in updates.items():
        if hasattr(existing, key):
            setattr(existing, key, value)

    updated = engine.update_profile(existing)
    from ipc.cache_writer import refresh_profiles_cache
    refresh_profiles_cache()
    return ProfileResponse(**updated.to_dict())


@router.delete("/profiles/{profile_id}", status_code=204)
async def delete_profile(profile_id: str) -> None:
    try:
        get_engine().delete_profile(profile_id)
    except ProfileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Profile '{profile_id}' not found")
    except ProfileInUseError:
        raise HTTPException(
            status_code=409, detail="Cannot delete a profile with an active session"
        )
    from ipc.cache_writer import refresh_profiles_cache
    refresh_profiles_cache()
