"""Unit tests for config.engine.ConfigEngine."""

import json
import pytest
from pathlib import Path
from config.engine import ConfigEngine


@pytest.fixture
def tmp_config(tmp_path):
    config_file = tmp_path / "config.json"
    engine = ConfigEngine(config_path=config_file)
    engine.load()
    return engine, config_file


class TestConfigEngine:

    def test_load_creates_default_config(self, tmp_config):
        engine, config_file = tmp_config
        assert config_file.exists()

    def test_list_profiles_empty_by_default(self, tmp_config):
        engine, _ = tmp_config
        assert engine.list_profiles() == []

    def test_create_and_get_profile(self, tmp_config):
        engine, _ = tmp_config
        profile = engine.create_profile(
            display_name="Test Server",
            hostname="192.168.1.1",
            port=22,
            username="admin",
            auth_method="password",
            password="secret",
        )
        assert profile.display_name == "Test Server"
        assert profile.hostname == "192.168.1.1"

        fetched = engine.get_profile(profile.id)
        assert fetched.id == profile.id
        assert fetched.username == "admin"

    def test_update_profile(self, tmp_config):
        engine, _ = tmp_config
        profile = engine.create_profile(
            display_name="Before",
            hostname="10.0.0.1",
            port=22,
            username="user",
            auth_method="password",
            password="pass",
        )
        engine.update_profile(profile.id, display_name="After")
        updated = engine.get_profile(profile.id)
        assert updated.display_name == "After"

    def test_delete_profile(self, tmp_config):
        engine, _ = tmp_config
        profile = engine.create_profile(
            display_name="To Delete",
            hostname="10.0.0.2",
            port=22,
            username="u",
            auth_method="password",
            password="p",
        )
        engine.delete_profile(profile.id)
        with pytest.raises(Exception):
            engine.get_profile(profile.id)

    def test_profile_not_found_raises(self, tmp_config):
        engine, _ = tmp_config
        from shared.exceptions import ProfileNotFoundError
        with pytest.raises(ProfileNotFoundError):
            engine.get_profile("nonexistent-uuid")

    def test_config_persists_after_save(self, tmp_config):
        engine, config_file = tmp_config
        engine.create_profile(
            display_name="Persistent",
            hostname="1.2.3.4",
            port=2222,
            username="op",
            auth_method="password",
            password="pw",
        )
        engine.save()

        # Reload into a new engine instance
        engine2 = ConfigEngine(config_path=config_file)
        engine2.load()
        profiles = engine2.list_profiles()
        assert any(p.display_name == "Persistent" for p in profiles)
