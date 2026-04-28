"""Custom exception hierarchy for ServerMind MCP."""


class ServerMindError(Exception):
    """Base exception for all ServerMind errors."""


# --- Configuration ---

class ConfigError(ServerMindError):
    """Raised when configuration loading or validation fails."""


class ConfigValidationError(ConfigError):
    """Raised when the configuration file fails JSON Schema validation."""

    def __init__(self, violations: list[str]) -> None:
        self.violations = violations
        super().__init__(f"Configuration validation failed: {'; '.join(violations)}")


class ConfigMigrationError(ConfigError):
    """Raised when a configuration migration cannot be applied."""


# --- Profile ---

class ProfileNotFoundError(ServerMindError):
    """Raised when a server profile UUID cannot be found."""

    def __init__(self, profile_id: str) -> None:
        self.profile_id = profile_id
        super().__init__(f"Server profile not found: {profile_id}")


class ProfileInUseError(ServerMindError):
    """Raised when attempting to delete a profile that is in an active session."""

    def __init__(self, profile_id: str) -> None:
        self.profile_id = profile_id
        super().__init__(f"Profile {profile_id} is in an active session and cannot be deleted.")


# --- SSH / Session ---

class SSHError(ServerMindError):
    """Base exception for SSH-related errors."""


class PPKLoadError(SSHError):
    """Raised when a PPK key file cannot be loaded or parsed."""


class AuthenticationError(SSHError):
    """Raised when SSH authentication fails."""


class HostKeyMismatchError(SSHError):
    """Raised when the server presents a host key that differs from the stored key."""

    def __init__(self, hostname: str) -> None:
        self.hostname = hostname
        super().__init__(
            f"Host key mismatch for {hostname}. The server's key has changed. "
            "Verify the server identity before accepting the new key."
        )


class ConnectionError(SSHError):  # noqa: A001
    """Raised when the TCP or SSH connection cannot be established."""


class SessionAlreadyExposedError(ServerMindError):
    """Raised when attempting to expose a session while one is already active."""


class NoActiveSessionError(ServerMindError):
    """Raised when a command is submitted with no active SSH session."""


class SessionFaultError(ServerMindError):
    """Raised when attempting to use a session that is in FAULT state."""


# --- Command ---

class CommandError(ServerMindError):
    """Base exception for command execution errors."""


class CommandTimeoutError(CommandError):
    """Raised when a command exceeds its timeout."""


class OutputTruncatedError(CommandError):
    """Informational: raised when command output was truncated at the size limit."""


# --- IPC ---

class IPCError(ServerMindError):
    """Base exception for IPC bridge errors."""


class IPCAuthError(IPCError):
    """Raised when an IPC request fails authentication."""


class IPCUnavailableError(IPCError):
    """Raised when the IPC bridge cannot be reached."""


# --- MCP ---

class MCPToolError(ServerMindError):
    """Raised when an MCP tool handler encounters an unrecoverable error."""
