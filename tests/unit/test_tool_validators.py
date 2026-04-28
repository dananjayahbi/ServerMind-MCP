"""Unit tests for mcp_server.validators.tool_schemas."""

import pytest
from mcp_server.validators.tool_schemas import validate_tool_input


class TestToolValidators:

    def test_list_profiles_valid(self):
        errors = validate_tool_input("server_list_profiles", {})
        assert errors == []

    def test_expose_valid(self):
        errors = validate_tool_input("server_expose", {"profile_id": "some-uuid"})
        assert errors == []

    def test_expose_missing_profile_id(self):
        errors = validate_tool_input("server_expose", {})
        assert len(errors) > 0

    def test_expose_empty_profile_id(self):
        errors = validate_tool_input("server_expose", {"profile_id": ""})
        assert len(errors) > 0

    def test_execute_command_valid(self):
        errors = validate_tool_input("server_execute_command", {"command": "ls -la"})
        assert errors == []

    def test_execute_command_with_timeout(self):
        errors = validate_tool_input("server_execute_command", {"command": "ls", "timeout_sec": 60})
        assert errors == []

    def test_execute_command_invalid_timeout(self):
        errors = validate_tool_input("server_execute_command", {"command": "ls", "timeout_sec": 0})
        assert len(errors) > 0

    def test_execute_command_missing_command(self):
        errors = validate_tool_input("server_execute_command", {})
        assert len(errors) > 0

    def test_send_terminal_input_valid(self):
        errors = validate_tool_input("server_send_terminal_input", {"input": "echo hi"})
        assert errors == []

    def test_send_terminal_input_invalid_wait(self):
        errors = validate_tool_input("server_send_terminal_input", {"input": "hi", "wait_ms": 50})
        assert len(errors) > 0

    def test_read_log_valid(self):
        errors = validate_tool_input("server_read_log", {"limit": 50})
        assert errors == []

    def test_read_log_invalid_category(self):
        errors = validate_tool_input("server_read_log", {"category": "INVALID_CAT"})
        assert len(errors) > 0

    def test_unknown_tool(self):
        errors = validate_tool_input("nonexistent_tool", {})
        assert len(errors) > 0

    def test_extra_properties_rejected(self):
        errors = validate_tool_input("server_disconnect", {"extra_field": "value"})
        assert len(errors) > 0
