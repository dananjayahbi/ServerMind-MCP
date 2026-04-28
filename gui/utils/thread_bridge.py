"""Thread-safe bridge between background IPC threads and the Tkinter main thread."""

from __future__ import annotations

import queue
from typing import Any, Callable


class ThreadBridge:
    """
    A queue-based bridge for posting callable tasks from background threads
    to be executed on the Tkinter main thread.

    Usage:
        bridge = ThreadBridge()
        # background thread:
        bridge.post(lambda: my_widget.configure(text="hello"))
        # main thread (called from after() loop):
        bridge.drain()
    """

    def __init__(self, maxsize: int = 1000) -> None:
        self._queue: queue.Queue[Callable[[], Any]] = queue.Queue(maxsize=maxsize)

    def post(self, task: Callable[[], Any]) -> None:
        """Post a callable to run on the main thread. Non-blocking; drops if full."""
        try:
            self._queue.put_nowait(task)
        except queue.Full:
            pass  # Silently drop; GUI will resync on next poll cycle

    def drain(self, max_tasks: int = 50) -> None:
        """
        Execute up to max_tasks pending tasks.
        Call this from after() loop on the main thread.
        """
        processed = 0
        while processed < max_tasks:
            try:
                task = self._queue.get_nowait()
                task()
                processed += 1
            except queue.Empty:
                break
            except Exception:
                pass  # Swallow individual task errors to keep the loop alive
