"""CommandResult construction helpers."""

from shared.constants import CommandStatus
from shared.models import CommandResult


def session_unavailable(command_id: str, detail: str = "") -> CommandResult:
    return CommandResult(
        command_id=command_id,
        status=CommandStatus.SESSION_UNAVAILABLE,
        stdout="",
        stderr=detail or "No active SSH session.",
    )


def command_error(command_id: str, detail: str) -> CommandResult:
    return CommandResult(
        command_id=command_id,
        status=CommandStatus.ERROR,
        stdout="",
        stderr=detail,
    )
