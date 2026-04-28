"""Reconnection policy with exponential backoff and jitter."""

from __future__ import annotations

import logging
import random
import threading
import time
from typing import Callable

logger = logging.getLogger(__name__)


class ReconnectPolicy:
    """
    Implements exponential backoff with jitter for SSH session reconnection.

    Callbacks:
    - on_attempt(attempt_number): called before each attempt
    - on_success(): called when reconnection succeeds
    - on_fault(): called when max attempts are exhausted
    """

    def __init__(
        self,
        session_uuid: str,
        reconnect_fn: Callable[[], bool],
        base_delay_sec: int = 5,
        max_interval_sec: int = 120,
        max_attempts: int | None = None,
        on_attempt: Callable[[int], None] | None = None,
        on_success: Callable[[], None] | None = None,
        on_fault: Callable[[], None] | None = None,
    ) -> None:
        self._session_uuid = session_uuid
        self._reconnect_fn = reconnect_fn
        self._base_delay = base_delay_sec
        self._max_interval = max_interval_sec
        self._max_attempts = max_attempts
        self._on_attempt = on_attempt
        self._on_success = on_success
        self._on_fault = on_fault
        self._stop_event = threading.Event()
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        self._stop_event.clear()
        self._thread = threading.Thread(
            target=self._run,
            name=f"reconnect-{self._session_uuid[:8]}",
            daemon=True,
        )
        self._thread.start()

    def stop(self) -> None:
        self._stop_event.set()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=10)

    def _run(self) -> None:
        attempt = 0
        while not self._stop_event.is_set():
            attempt += 1

            if self._max_attempts is not None and attempt > self._max_attempts:
                logger.warning(
                    "Session %s: max reconnect attempts (%d) exhausted",
                    self._session_uuid,
                    self._max_attempts,
                )
                if self._on_fault:
                    self._on_fault()
                return

            if self._on_attempt:
                self._on_attempt(attempt)

            logger.info(
                "Session %s: reconnect attempt %d", self._session_uuid, attempt
            )

            try:
                success = self._reconnect_fn()
                if success:
                    logger.info(
                        "Session %s: reconnected on attempt %d",
                        self._session_uuid,
                        attempt,
                    )
                    if self._on_success:
                        self._on_success()
                    return
            except Exception as exc:
                logger.warning(
                    "Session %s: reconnect attempt %d failed: %s",
                    self._session_uuid,
                    attempt,
                    exc,
                )

            # Exponential backoff with jitter
            delay = min(
                self._base_delay * (2 ** (attempt - 1)), self._max_interval
            )
            jitter = random.uniform(0, delay * 0.25)
            wait = delay + jitter
            logger.debug(
                "Session %s: waiting %.1fs before next reconnect attempt",
                self._session_uuid,
                wait,
            )
            self._stop_event.wait(timeout=wait)
