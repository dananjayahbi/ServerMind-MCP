"""Thread-safe in-memory ring buffer for log entries."""

from __future__ import annotations

import threading
from collections import deque
from typing import Iterator

from shared.models import LogEntry


class RingBuffer:
    """Fixed-capacity FIFO buffer for LogEntry objects."""

    def __init__(self, capacity: int = 5000) -> None:
        self._capacity = capacity
        self._buf: deque[LogEntry] = deque(maxlen=capacity)
        self._lock = threading.RLock()

    def append(self, entry: LogEntry) -> None:
        with self._lock:
            self._buf.append(entry)

    def get_all(self) -> list[LogEntry]:
        with self._lock:
            return list(self._buf)

    def get_filtered(
        self,
        limit: int = 200,
        category: str | None = None,
        level: str | None = None,
        since_timestamp: str | None = None,
    ) -> list[LogEntry]:
        with self._lock:
            entries = list(self._buf)

        if since_timestamp:
            entries = [e for e in entries if e.timestamp > since_timestamp]
        if category:
            entries = [e for e in entries if e.category == category]
        if level:
            entries = [e for e in entries if e.level == level]

        return entries[-limit:]

    def __len__(self) -> int:
        with self._lock:
            return len(self._buf)

    def __iter__(self) -> Iterator[LogEntry]:
        with self._lock:
            return iter(list(self._buf))
