"""Pydantic models for IPC API request/response."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class ExposeRequest(BaseModel):
    profile_id: str


class TerminalSendRequest(BaseModel):
    command_text: str


class CreateProfileRequest(BaseModel):
    display_name: str
    hostname: str
    port: int = 22
    username: str
    ppk_file_path: str = ""
    auth_method: str = "password"
    password: str = ""
    notes: str = ""
    keepalive_transport_interval_sec: int = 60
    keepalive_app_interval_sec: int = 120
    connection_timeout_sec: int = 30
    max_reconnect_attempts: int | None = None
    reconnect_base_delay_sec: int = 5


class UpdateProfileRequest(BaseModel):
    display_name: str | None = None
    hostname: str | None = None
    port: int | None = None
    username: str | None = None
    ppk_file_path: str | None = None
    auth_method: str | None = None
    password: str | None = None
    notes: str | None = None
    keepalive_transport_interval_sec: int | None = None
    keepalive_app_interval_sec: int | None = None
    connection_timeout_sec: int | None = None
    max_reconnect_attempts: int | None = None
    reconnect_base_delay_sec: int | None = None


class HealthResponse(BaseModel):
    status: str = "ok"
    version: str
    uptime_sec: float


class SessionStatusResponse(BaseModel):
    state: str
    session_uuid: str | None = None
    profile_id: str | None = None
    connected_at: str | None = None
    last_keepalive_at: str | None = None
    reconnect_attempt_count: int = 0
    commands_executed: int = 0
    last_command_at: str | None = None


class ProfileResponse(BaseModel):
    id: str
    display_name: str
    hostname: str
    port: int
    username: str
    ppk_file_path: str
    keepalive_transport_interval_sec: int
    keepalive_app_interval_sec: int
    connection_timeout_sec: int
    max_reconnect_attempts: int | None
    reconnect_base_delay_sec: int
    notes: str
    created_at: str
    updated_at: str


class LogEntryResponse(BaseModel):
    entry_id: str
    timestamp: str
    category: str
    level: str
    actor: str | None = None
    profile_id: str | None = None
    session_uuid: str | None = None
    message: str
    payload: dict[str, Any] | None = None


class ExposeResponse(BaseModel):
    session_uuid: str
    state: str
    message: str = ""


class DisconnectResponse(BaseModel):
    session_uuid: str | None = None
    message: str


class TerminalSendResponse(BaseModel):
    command_id: str
    status: str = "ok"
    stdout: str = ""
    stderr: str = ""
    exit_code: int | None = None
    duration_ms: int = 0
    message: str = "Command submitted"
