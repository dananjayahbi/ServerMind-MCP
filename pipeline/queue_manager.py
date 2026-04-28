"""Thread-safe command queue with a single consumer thread."""

from __future__ import annotations

import logging
import queue
import threading
from typing import Callable

from pipeline.executor import execute
from pipeline.result import session_unavailable
from shared.models import CommandRequest, CommandResult

logger = logging.getLogger(__name__)

# Future-like container for async result delivery
class _PendingCommand:
    def __init__(self, request: CommandRequest) -> None:
        self.request = request
        self._event = threading.Event()
        self._result: CommandResult | None = None

    def set_result(self, result: CommandResult) -> None:
        self._result = result
        self._event.set()

    def wait(self, timeout: float | None = None) -> CommandResult | None:
        self._event.wait(timeout=timeout)
        return self._result


class CommandQueueManager:
    """
    Manages a FIFO command queue with a single consumer thread.
    Ensures sequential command execution on the SSH channel.
    """

    def __init__(self) -> None:
        self._queue: queue.Queue[_PendingCommand | None] = queue.Queue()
        self._consumer: threading.Thread | None = None
        self._running = False
        self._lock = threading.Lock()
        # Optional callback invoked after each command completes
        self._result_callback: Callable[[CommandResult], None] | None = None

    def set_result_callback(self, fn: Callable[[CommandResult], None]) -> None:
        self._result_callback = fn

    def start(self) -> None:
        with self._lock:
            if self._running:
                return
            self._running = True
            self._consumer = threading.Thread(
                target=self._consume,
                name="cmd-queue-consumer",
                daemon=True,
            )
            self._consumer.start()

    def stop(self) -> None:
        with self._lock:
            if not self._running:
                return
            self._running = False
            self._queue.put(None)  # Poison pill
        if self._consumer:
            self._consumer.join(timeout=10)

    def submit(self, request: CommandRequest, timeout: float | None = None) -> CommandResult:
        """
        Submit a command and block until it completes (or timeout expires).
        """
        pending = _PendingCommand(request)
        self._queue.put(pending)
        result = pending.wait(timeout=timeout or request.timeout_sec + 5)
        if result is None:
            return session_unavailable(request.command_id, "Command timed out in queue.")
        return result

    def submit_async(self, request: CommandRequest) -> None:
        """Submit a command without waiting for completion."""
        pending = _PendingCommand(request)
        self._queue.put(pending)

    def _consume(self) -> None:
        while True:
            pending = self._queue.get()
            if pending is None:
                break
            try:
                result = execute(pending.request)
            except Exception as exc:
                logger.exception("Unhandled error in command executor")
                from pipeline.result import command_error
                result = command_error(pending.request.command_id, str(exc))

            pending.set_result(result)

            if self._result_callback:
                try:
                    self._result_callback(result)
                except Exception:
                    logger.exception("Error in command result callback")


# Module-level singleton
_queue_manager: CommandQueueManager | None = None


def get_queue_manager() -> CommandQueueManager:
    global _queue_manager
    if _queue_manager is None:
        _queue_manager = CommandQueueManager()
    return _queue_manager
