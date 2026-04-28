"""Internal event bus (pub/sub) for the IPC bridge."""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Callable

logger = logging.getLogger(__name__)

# Dict of event_type -> list of async callback coroutines
_subscribers: dict[str, list[Callable[[dict[str, Any]], None]]] = {}
_async_queue: asyncio.Queue | None = None


def get_async_queue() -> asyncio.Queue:
    global _async_queue
    if _async_queue is None:
        _async_queue = asyncio.Queue()
    return _async_queue


def set_async_queue(q: asyncio.Queue) -> None:
    global _async_queue
    _async_queue = q


async def publish(event_type: str, payload: Any) -> None:
    """Publish an event to all subscribers."""
    q = get_async_queue()
    await q.put({"type": event_type, "payload": payload})


def publish_sync(event_type: str, payload: Any) -> None:
    """Thread-safe publish from non-async code."""
    q = get_async_queue()
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            asyncio.run_coroutine_threadsafe(
                _put_event(q, event_type, payload), loop
            )
        else:
            q.put_nowait({"type": event_type, "payload": payload})
    except Exception as exc:
        logger.debug("Event bus publish error: %s", exc)


async def _put_event(q: asyncio.Queue, event_type: str, payload: Any) -> None:
    await q.put({"type": event_type, "payload": payload})
