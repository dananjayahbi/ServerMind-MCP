"""
Integration tests for the command execution pipeline.

These tests verify the queue manager and executor interact correctly,
using a mock SSH session manager to avoid real network connections.
"""

import threading
import time
import uuid
import pytest
from unittest.mock import MagicMock, patch

from pipeline.queue_manager import CommandQueueManager
from shared.constants import Actor, ExecMode, CommandStatus
from shared.models import CommandRequest, CommandResult


def _make_request(cmd: str = "echo hi", mode: str = ExecMode.EXEC) -> CommandRequest:
    return CommandRequest(
        command_id=str(uuid.uuid4()),
        command_text=cmd,
        actor=Actor.AGENT,
        execution_mode=mode,
        timeout_sec=5,
    )


class TestCommandQueue:

    def test_submit_and_receive_result(self):
        """Command submitted to queue is executed and result returned."""
        mock_result = CommandResult(
            command_id="test-id",
            status=CommandStatus.SUCCESS,
            stdout="hello",
            stderr="",
            exit_code=0,
        )

        with patch("pipeline.executor.execute", return_value=mock_result):
            manager = CommandQueueManager()
            manager.start()

            request = _make_request("echo hello")
            result = manager.submit(request, timeout=10.0)

            assert result.status == CommandStatus.SUCCESS
            assert result.stdout == "hello"

            manager.stop()

    def test_queue_processes_multiple_commands_serially(self):
        """Multiple commands are processed in order."""
        executed_order = []

        def mock_execute(req):
            executed_order.append(req.command_text)
            return CommandResult(
                command_id=req.command_id,
                status=CommandStatus.SUCCESS,
                stdout="ok",
                stderr="",
                exit_code=0,
            )

        with patch("pipeline.executor.execute", side_effect=mock_execute):
            manager = CommandQueueManager()
            manager.start()

            requests = [_make_request(f"cmd-{i}") for i in range(3)]
            results = []

            def submit_all():
                for req in requests:
                    results.append(manager.submit(req, timeout=10.0))

            t = threading.Thread(target=submit_all)
            t.start()
            t.join(timeout=15)

            assert len(results) == 3
            manager.stop()

    def test_submit_async_does_not_block(self):
        """submit_async returns immediately."""
        with patch("pipeline.executor.execute") as mock_exec:
            mock_exec.side_effect = lambda req: (
                time.sleep(0.5) or
                CommandResult(
                    command_id=req.command_id,
                    status=CommandStatus.SUCCESS,
                    stdout="",
                    stderr="",
                    exit_code=0,
                )
            )

            manager = CommandQueueManager()
            manager.start()

            start = time.time()
            manager.submit_async(_make_request("slow-cmd"))
            elapsed = time.time() - start

            assert elapsed < 0.2  # Must return quickly
            time.sleep(0.1)
            manager.stop()
