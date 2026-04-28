"""Main audit logger for ServerMind MCP."""

from __future__ import annotations

import logging
import queue
import threading
from typing import Any, Callable

from audit.file_handler import create_rotating_handler
from audit.ring_buffer import RingBuffer
from shared.constants import (
    DEFAULT_LOG_BACKUP_COUNT,
    DEFAULT_LOG_BUFFER_SIZE,
    DEFAULT_LOG_MAX_FILE_SIZE_MB,
    Actor,
    EventCategory,
    LogLevel,
)
from shared.models import LogEntry

# Internal Python logger for the audit module itself
_py_log = logging.getLogger("audit")

# Callbacks registered to receive new entries (e.g., IPC event bus)
_emit_callbacks: list[Callable[[LogEntry], None]] = []
_emit_lock = threading.Lock()

# Global ring buffer
_ring_buffer: RingBuffer = RingBuffer(DEFAULT_LOG_BUFFER_SIZE)

# Async write queue + thread
_write_queue: queue.Queue[LogEntry | None] = queue.Queue()
_writer_thread: threading.Thread | None = None
_started = False
_start_lock = threading.Lock()


def add_emit_callback(fn: Callable[[LogEntry], None]) -> None:
    """Register a callback invoked for every new log entry (on the writer thread)."""
    with _emit_lock:
        _emit_callbacks.append(fn)


def get_ring_buffer() -> RingBuffer:
    return _ring_buffer


def start(
    buffer_size: int = DEFAULT_LOG_BUFFER_SIZE,
    max_file_size_mb: int = DEFAULT_LOG_MAX_FILE_SIZE_MB,
    backup_count: int = DEFAULT_LOG_BACKUP_COUNT,
) -> None:
    global _ring_buffer, _writer_thread, _started

    with _start_lock:
        if _started:
            return
        _ring_buffer = RingBuffer(buffer_size)

        file_handler = create_rotating_handler(
            max_bytes=max_file_size_mb * 1024 * 1024,
            backup_count=backup_count,
        )

        root = logging.getLogger()
        root.setLevel(logging.DEBUG)
        if not any(isinstance(h, type(file_handler)) for h in root.handlers):
            root.addHandler(file_handler)

        # Console handler for development
        console = logging.StreamHandler()
        console.setLevel(logging.INFO)
        console.setFormatter(
            logging.Formatter("%(asctime)s %(levelname)s [%(name)s] %(message)s")
        )
        root.addHandler(console)

        _writer_thread = threading.Thread(
            target=_writer_loop, name="audit-writer", daemon=True
        )
        _writer_thread.start()
        _started = True


def _writer_loop() -> None:
    while True:
        entry = _write_queue.get()
        if entry is None:
            break
        _ring_buffer.append(entry)
        with _emit_lock:
            for fn in list(_emit_callbacks):
                try:
                    fn(entry)
                except Exception:
                    _py_log.exception("Error in log emit callback")


def stop() -> None:
    global _started
    with _start_lock:
        if not _started:
            return
        _write_queue.put(None)
        if _writer_thread:
            _writer_thread.join(timeout=5)
        _started = False


def log(
    category: str,
    level: str,
    message: str,
    actor: str | None = Actor.SYSTEM,
    profile_id: str | None = None,
    session_uuid: str | None = None,
    payload: dict[str, Any] | None = None,
) -> LogEntry:
    entry = LogEntry(
        category=category,
        level=level,
        message=message,
        actor=actor,
        profile_id=profile_id,
        session_uuid=session_uuid,
        payload=payload,
    )
    _write_queue.put(entry)

    # Also emit to the Python logging system
    py_level = getattr(logging, level, logging.INFO)
    _py_log.log(py_level, "[%s] %s", category, message)

    return entry


# Convenience wrappers

def info(category: str, message: str, **kwargs: Any) -> LogEntry:
    return log(category, LogLevel.INFO, message, **kwargs)


def warning(category: str, message: str, **kwargs: Any) -> LogEntry:
    return log(category, LogLevel.WARNING, message, **kwargs)


def error(category: str, message: str, **kwargs: Any) -> LogEntry:
    return log(category, LogLevel.ERROR, message, **kwargs)


def critical(category: str, message: str, **kwargs: Any) -> LogEntry:
    return log(category, LogLevel.CRITICAL, message, **kwargs)


def debug(category: str, message: str, **kwargs: Any) -> LogEntry:
    return log(category, LogLevel.DEBUG, message, **kwargs)
