"""Unit tests for audit.ring_buffer.RingBuffer."""

import pytest
from audit.ring_buffer import RingBuffer
from shared.models import LogEntry
from shared.constants import EventCategory, LogLevel, Actor


def _make_entry(msg: str = "test", level: str = LogLevel.INFO, category: str = EventCategory.SYSTEM) -> LogEntry:
    return LogEntry(
        message=msg,
        level=level,
        category=category,
        actor=Actor.SYSTEM,
    )


class TestRingBuffer:

    def test_append_and_get_all(self):
        buf = RingBuffer(capacity=10)
        entry = _make_entry("hello")
        buf.append(entry)
        all_entries = buf.get_all()
        assert len(all_entries) == 1
        assert all_entries[0].message == "hello"

    def test_capacity_overflow_drops_oldest(self):
        buf = RingBuffer(capacity=3)
        for i in range(5):
            buf.append(_make_entry(f"msg-{i}"))
        result = buf.get_all()
        assert len(result) == 3
        messages = [e.message for e in result]
        assert "msg-0" not in messages
        assert "msg-4" in messages

    def test_get_filtered_by_level(self):
        buf = RingBuffer(capacity=100)
        buf.append(_make_entry("info-msg", level=LogLevel.INFO))
        buf.append(_make_entry("warn-msg", level=LogLevel.WARNING))
        buf.append(_make_entry("err-msg", level=LogLevel.ERROR))
        result = buf.get_filtered(level=LogLevel.WARNING)
        assert len(result) == 1
        assert result[0].message == "warn-msg"

    def test_get_filtered_by_category(self):
        buf = RingBuffer(capacity=100)
        buf.append(_make_entry(category=EventCategory.COMMAND))
        buf.append(_make_entry(category=EventCategory.CONNECTION))
        result = buf.get_filtered(category=EventCategory.COMMAND)
        assert len(result) == 1

    def test_get_filtered_limit(self):
        buf = RingBuffer(capacity=100)
        for i in range(20):
            buf.append(_make_entry(f"msg-{i}"))
        result = buf.get_filtered(limit=5)
        assert len(result) == 5

    def test_empty_buffer(self):
        buf = RingBuffer(capacity=10)
        assert buf.get_all() == []
        assert buf.get_filtered() == []

    def test_thread_safety(self):
        import threading
        buf = RingBuffer(capacity=1000)
        def writer():
            for i in range(100):
                buf.append(_make_entry(f"t-{i}"))
        threads = [threading.Thread(target=writer) for _ in range(5)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        # Should have at most 1000 entries, no crash
        assert len(buf.get_all()) <= 1000
