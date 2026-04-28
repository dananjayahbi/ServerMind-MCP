"""SSH connection establishment logic."""

from __future__ import annotations

import logging
import socket

import paramiko

from config.paths import get_known_hosts_path
from shared.exceptions import (
    AuthenticationError,
    HostKeyMismatchError,
    PPKLoadError,
)
from shared.models import ServerProfile
from ssh.ppk_handler import PPKHandler

logger = logging.getLogger(__name__)


class HostKeyPolicy(paramiko.MissingHostKeyPolicy):
    """
    Custom host key policy:
    - Accepts and stores new host keys on first connection.
    - Raises HostKeyMismatchError on key changes.
    """

    def __init__(self, known_hosts_path: str) -> None:
        self._path = known_hosts_path

    def missing_host_key(
        self, client: paramiko.SSHClient, hostname: str, key: paramiko.PKey
    ) -> None:
        client.get_host_keys().add(hostname, key.get_name(), key)
        try:
            client.save_host_keys(self._path)
        except OSError as exc:
            logger.warning("Could not save host key for %s: %s", hostname, exc)
        logger.info("Accepted and stored new host key for %s", hostname)


def establish_connection(
    profile: ServerProfile,
    passphrase: str | None = None,
) -> paramiko.SSHClient:
    """
    Establish an authenticated SSH connection for the given profile.
    Returns a connected paramiko.SSHClient.
    Raises SSHError subclasses on failure.
    """
    known_hosts = str(get_known_hosts_path())

    client = paramiko.SSHClient()
    client.load_system_host_keys()
    try:
        client.load_host_keys(known_hosts)
    except (OSError, paramiko.SSHException):
        pass  # No known_hosts file yet is acceptable

    client.set_missing_host_key_policy(HostKeyPolicy(known_hosts))

    # Load PPK key
    try:
        pkey = PPKHandler.load(profile.ppk_file_path, passphrase=passphrase)
    except PPKLoadError:
        raise

    # Connect
    try:
        client.connect(
            hostname=profile.hostname,
            port=profile.port,
            username=profile.username,
            pkey=pkey,
            timeout=profile.connection_timeout_sec,
            allow_agent=False,
            look_for_keys=False,
            banner_timeout=profile.connection_timeout_sec,
            auth_timeout=profile.connection_timeout_sec,
        )
    except paramiko.BadHostKeyException as exc:
        raise HostKeyMismatchError(profile.hostname) from exc
    except paramiko.AuthenticationException as exc:
        raise AuthenticationError(
            f"Authentication failed for {profile.username}@{profile.hostname}: {exc}"
        ) from exc
    except (socket.timeout, socket.error, OSError) as exc:
        from shared.exceptions import ConnectionError as SMConnectionError
        raise SMConnectionError(
            f"Network error connecting to {profile.hostname}:{profile.port}: {exc}"
        ) from exc
    except paramiko.SSHException as exc:
        from shared.exceptions import SSHError
        raise SSHError(f"SSH error connecting to {profile.hostname}: {exc}") from exc

    logger.info(
        "SSH connection established: %s@%s:%d",
        profile.username,
        profile.hostname,
        profile.port,
    )
    return client
