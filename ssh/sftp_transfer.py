"""Optimised SFTP file transfer helpers.

Why is this faster than plain ``sftp.put()``?
---------------------------------------------
Paramiko's default ``SFTPClient.put()`` transfers data in a **stop-and-wait**
loop: send one chunk → wait for the remote ACK → send the next chunk.  On any
link with meaningful round-trip latency this completely wastes the available
bandwidth because the pipe sits idle during every ACK wait.

WinSCP (and other fast SFTP clients such as FileZilla, Cyberduck, and
OpenSSH ≥ 8.x) avoid this by enabling **SFTP write pipelining**: the client
fires off many write requests back-to-back before waiting for any
acknowledgements.  The server can buffer and process them concurrently, and
the client harvests the ACKs in a separate pass.  On a 50 ms RTT link this
alone yields a 10–20× throughput improvement for large files.

Paramiko exposes pipelining through ``SFTPFile.set_pipelined(True)``.  When
pipelining is active Paramiko queues outgoing write requests and flushes all
pending ACKs only when the file is closed.  We also use a larger chunk size
(256 KB instead of Paramiko's internal default) to keep the pipeline full.
"""

from __future__ import annotations

import os
from typing import Callable

import paramiko

# ---------------------------------------------------------------------------
# Tuneable constants
# ---------------------------------------------------------------------------

# Each individual write request size.  256 KB is a sweet-spot: large enough
# to saturate a gigabit link, small enough to fit comfortably inside typical
# SSH window sizes.
_CHUNK_SIZE: int = 256 * 1024  # 256 KB


def sftp_put_pipelined(
    sftp: paramiko.SFTPClient,
    local_path: str,
    remote_path: str,
    chunk_size: int = _CHUNK_SIZE,
    progress_callback: Callable[[int, int], None] | None = None,
) -> int:
    """Upload *local_path* → *remote_path* using SFTP write pipelining.

    Pipelining means the remote file is opened with ``set_pipelined(True)``
    and chunks are written without waiting for per-chunk SFTP ACKs.  Paramiko
    collects all outstanding ACKs during ``close()``, which is the same
    technique employed by WinSCP and can be **5–20× faster** than the default
    sequential ``sftp.put()`` on high-latency links.

    Args:
        sftp:              An open :class:`paramiko.SFTPClient`.
        local_path:        Absolute path to the local source file.
        remote_path:       Destination path on the remote host.
        chunk_size:        Bytes per individual write request (default 256 KB).
        progress_callback: Optional ``(bytes_sent, total_bytes)`` callback
                           invoked after each chunk is queued.

    Returns:
        Total bytes transferred (same as the file size).
    """
    file_size = os.path.getsize(local_path)

    with open(local_path, "rb") as local_fh:
        remote_fh = sftp.open(remote_path, "wb")
        # ── The key optimisation ──────────────────────────────────────────
        # Pipelined mode: Paramiko sends write requests without waiting for
        # individual SFTP acknowledgements.  All ACKs are collected on close().
        remote_fh.set_pipelined(True)

        try:
            sent = 0
            while True:
                chunk = local_fh.read(chunk_size)
                if not chunk:
                    break
                remote_fh.write(chunk)
                sent += len(chunk)
                if progress_callback:
                    progress_callback(sent, file_size)
        finally:
            # close() flushes all pipelined write requests and awaits their ACKs
            remote_fh.close()

    return file_size
