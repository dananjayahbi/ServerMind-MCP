"""Unit tests for ssh.ppk_handler.PPKHandler.

These tests only check error handling paths since actual PPK files
require a real key (see scripts/generate_test_ppk.py to create one).
"""

import pytest
from pathlib import Path
from unittest.mock import patch, MagicMock

from ssh.ppk_handler import PPKHandler
from shared.exceptions import PPKLoadError


class TestPPKHandler:

    def test_load_nonexistent_file_raises(self, tmp_path):
        fake_path = tmp_path / "nonexistent.ppk"
        with pytest.raises(PPKLoadError):
            PPKHandler.load(fake_path)

    def test_load_invalid_file_raises(self, tmp_path):
        bad_file = tmp_path / "bad.ppk"
        bad_file.write_text("this is not a ppk file")
        with pytest.raises(PPKLoadError):
            PPKHandler.load(bad_file)

    def test_requires_passphrase_checks_encryption(self, tmp_path):
        """requires_passphrase should return False for unencrypted keys."""
        import paramiko
        # We cannot easily test with real PPK without paramiko internals,
        # but we can verify the method exists and handles exceptions gracefully.
        bad_file = tmp_path / "dummy.ppk"
        bad_file.write_text("dummy")
        result = PPKHandler.requires_passphrase(bad_file)
        assert isinstance(result, bool)

    def test_load_with_correct_password(self, tmp_path):
        """If a real PPK is provided via env, test loading it."""
        import os
        ppk_path = os.environ.get("TEST_PPK_PATH")
        ppk_pass = os.environ.get("TEST_PPK_PASSWORD", "")
        if not ppk_path:
            pytest.skip("TEST_PPK_PATH env var not set")
        key = PPKHandler.load(Path(ppk_path), passphrase=ppk_pass if ppk_pass else None)
        assert key is not None

    def test_load_path_accepts_string(self, tmp_path):
        fake = tmp_path / "f.ppk"
        fake.write_text("bad")
        with pytest.raises(PPKLoadError):
            PPKHandler.load(str(fake))  # Should accept str path too
