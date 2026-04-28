"""Internal event bus (pub/sub) for the IPC bridge."""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Callable

logger = logging.getLogger(__name__)

# Dict of event_type -> list of async callback coroutines
_subscribers: dict[str, list[Callable[[dict[str, Any]], None]]] = {}
_async_queue: asyncio.Queue | None = None
# The running event loop used by FastAPI/uvicorn – set once on startup
_running_loop: asyncio.AbstractEventLoop | None = None


def get_async_queue() -> asyncio.Queue:
    global _async_queue
    if _async_queue is None:
        _async_queue = asyncio.Queue()
    return _async_queue


def set_async_queue(q: asyncio.Queue) -> None:
    global _async_queue
    _async_queue = q


def set_running_loop(loop: asyncio.AbstractEventLoop) -> None:
    """Store the event loop so background threads can publish events correctly."""
    global _running_loop
    _running_loop = loop


async def publish(event_type: str, payload: Any) -> None:
    """Publish an event to all subscribers."""
    q = get_async_queue()
    await q.put({"type": event_type, "payload": payload})


def publish_sync(event_type: str, payload: Any) -> None:
    """Thread-safe publish from non-async code (e.g. background threads)."""
    q = get_async_queue()
    loop = _running_loop
    if loop is not None and loop.is_running():
        # Correct way to push into an asyncio.Queue from a background thread
        asyncio.run_coroutine_threadsafe(_put_event(q, event_type, payload), loop)
    else:
        # Fallback: direct put (safe only if called from within the event loop)
        try:
            q.put_nowait({"type": event_type, "payload": payload})
        except Exception as exc:
            logger.debug("Event bus publish fallback error: %s", exc)


async def _put_event(q: asyncio.Queue, event_type: str, payload: Any) -> None:
    await q.put({"type": event_type, "payload": payload})
