"""App settings endpoints — read and update application configuration."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from config.engine import get_engine
from config.schema import DEFAULT_APP_SETTINGS

router = APIRouter()


class AppSettingsResponse(BaseModel):
    ipc_port: int
    ui_theme: str
    log_buffer_size: int
    log_max_file_size_mb: int
    log_backup_count: int
    default_command_timeout_sec: int
    ipc_poll_interval_ms: int


class AppSettingsUpdateRequest(BaseModel):
    ipc_port: int | None = None
    ui_theme: str | None = None
    log_buffer_size: int | None = None
    log_max_file_size_mb: int | None = None
    log_backup_count: int | None = None
    default_command_timeout_sec: int | None = None
    ipc_poll_interval_ms: int | None = None


def _to_response(raw: dict[str, Any]) -> AppSettingsResponse:
    merged = {**DEFAULT_APP_SETTINGS, **raw}
    return AppSettingsResponse(**merged)


@router.get("/settings", response_model=AppSettingsResponse)
async def get_settings() -> AppSettingsResponse:
    """Return the current application settings."""
    return _to_response(get_engine().get_app_settings())


@router.put("/settings", response_model=AppSettingsResponse)
async def update_settings(req: AppSettingsUpdateRequest) -> AppSettingsResponse:
    """Partially update application settings and persist them."""
    updates = req.model_dump(exclude_none=True)

    # Basic validation
    if "ui_theme" in updates and updates["ui_theme"] not in ("dark", "light"):
        raise HTTPException(status_code=422, detail="ui_theme must be 'dark' or 'light'")
    if "ipc_port" in updates and not (1024 <= updates["ipc_port"] <= 65535):
        raise HTTPException(status_code=422, detail="ipc_port must be 1024–65535")

    if updates:
        get_engine().update_app_settings(updates)

    return _to_response(get_engine().get_app_settings())
