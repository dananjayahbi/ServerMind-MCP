"""Shared dataclasses used by both mcp_server and gui packages."""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from shared.constants import (
    DEFAULT_CONNECTION_TIMEOUT,
    DEFAULT_KEEPALIVE_APP_INTERVAL,
    DEFAULT_KEEPALIVE_TRANSPORT_INTERVAL,
    DEFAULT_RECONNECT_BASE_DELAY,
    DEFAULT_SSH_PORT,
    SessionState,
)


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _new_uuid() -> str:
    return str(uuid.uuid4())


@dataclass
class ServerProfile:
    """Represents a single saved server configuration."""

    display_name: str
    hostname: str
    username: str
    ppk_file_path: str

    id: str = field(default_factory=_new_uuid)
    port: int = DEFAULT_SSH_PORT
    auth_method: str = "password"
    password: str = ""
    sudo_password: str = ""
    keepalive_transport_interval_sec: int = DEFAULT_KEEPALIVE_TRANSPORT_INTERVAL
    keepalive_app_interval_sec: int = DEFAULT_KEEPALIVE_APP_INTERVAL
    connection_timeout_sec: int = DEFAULT_CONNECTION_TIMEOUT
    max_reconnect_attempts: int | None = None
    reconnect_base_delay_sec: int = DEFAULT_RECONNECT_BASE_DELAY
    notes: str = ""
    created_at: str = field(default_factory=_utcnow_iso)
    updated_at: str = field(default_factory=_utcnow_iso)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "display_name": self.display_name,
            "hostname": self.hostname,
            "port": self.port,
            "username": self.username,
            "ppk_file_path": self.ppk_file_path,
            "auth_method": self.auth_method,
            "password": self.password,
            "sudo_password": self.sudo_password,
            "keepalive_transport_interval_sec": self.keepalive_transport_interval_sec,
            "keepalive_app_interval_sec": self.keepalive_app_interval_sec,
            "connection_timeout_sec": self.connection_timeout_sec,
            "max_reconnect_attempts": self.max_reconnect_attempts,
            "reconnect_base_delay_sec": self.reconnect_base_delay_sec,
            "notes": self.notes,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "ServerProfile":
        return cls(
            id=data["id"],
            display_name=data["display_name"],
            hostname=data["hostname"],
            port=data.get("port", DEFAULT_SSH_PORT),
            username=data["username"],
            ppk_file_path=data.get("ppk_file_path", ""),
            auth_method=data.get("auth_method", "password"),
            password=data.get("password", ""),
            sudo_password=data.get("sudo_password", ""),
            keepalive_transport_interval_sec=data.get(
                "keepalive_transport_interval_sec", DEFAULT_KEEPALIVE_TRANSPORT_INTERVAL
            ),
            keepalive_app_interval_sec=data.get(
                "keepalive_app_interval_sec", DEFAULT_KEEPALIVE_APP_INTERVAL
            ),
            connection_timeout_sec=data.get(
                "connection_timeout_sec", DEFAULT_CONNECTION_TIMEOUT
            ),
            max_reconnect_attempts=data.get("max_reconnect_attempts"),
            reconnect_base_delay_sec=data.get(
                "reconnect_base_delay_sec", DEFAULT_RECONNECT_BASE_DELAY
            ),
            notes=data.get("notes", ""),
            created_at=data.get("created_at", _utcnow_iso()),
            updated_at=data.get("updated_at", _utcnow_iso()),
        )


@dataclass
class SessionStateModel:
    """Represents the live state of an SSH session."""

    state: str = SessionState.DISCONNECTED
    session_uuid: str | None = None
    profile_id: str | None = None
    connected_at: str | None = None
    last_keepalive_at: str | None = None
    reconnect_attempt_count: int = 0
    commands_executed: int = 0
    last_command_at: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "state": self.state,
            "session_uuid": self.session_uuid,
            "profile_id": self.profile_id,
            "connected_at": self.connected_at,
            "last_keepalive_at": self.last_keepalive_at,
            "reconnect_attempt_count": self.reconnect_attempt_count,
            "commands_executed": self.commands_executed,
            "last_command_at": self.last_command_at,
        }


@dataclass
class CommandRequest:
    """Submitted by an MCP tool call or the GUI manual terminal."""

    command_text: str
    actor: str
    execution_mode: str
    timeout_sec: int
    command_id: str = field(default_factory=_new_uuid)
    submitted_at: str = field(default_factory=_utcnow_iso)


@dataclass
class CommandResult:
    """Produced by the Command Execution Pipeline."""

    command_id: str
    status: str
    exit_code: int | None = None
    stdout: str = ""
    stderr: str = ""
    truncated: bool = False
    duration_ms: int = 0
    completed_at: str = field(default_factory=_utcnow_iso)

    def to_dict(self) -> dict[str, Any]:
        return {
            "command_id": self.command_id,
            "status": self.status,
            "exit_code": self.exit_code,
            "stdout": self.stdout,
            "stderr": self.stderr,
            "truncated": self.truncated,
            "duration_ms": self.duration_ms,
            "completed_at": self.completed_at,
        }


@dataclass
class LogEntry:
    """A single audit log record."""

    category: str
    level: str
    message: str
    actor: str | None = None
    profile_id: str | None = None
    session_uuid: str | None = None
    payload: dict[str, Any] | None = None
    entry_id: str = field(default_factory=_new_uuid)
    timestamp: str = field(default_factory=_utcnow_iso)

    def to_dict(self) -> dict[str, Any]:
        return {
            "entry_id": self.entry_id,
            "timestamp": self.timestamp,
            "category": self.category,
            "level": self.level,
            "actor": self.actor,
            "profile_id": self.profile_id,
            "session_uuid": self.session_uuid,
            "message": self.message,
            "payload": self.payload,
        }
