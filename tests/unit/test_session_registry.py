"""Unit tests for ssh.session_registry.SessionRegistry."""

import pytest
from ssh.session_registry import SessionRegistry
from shared.constants import SessionState


@pytest.fixture
def registry():
    return SessionRegistry()


class TestSessionRegistry:

    def test_register_and_get(self, registry):
        entry = registry.register(profile_id="profile-1")
        assert entry.session_uuid is not None
        fetched = registry.get(entry.session_uuid)
        assert fetched is not None
        assert fetched.profile_id == "profile-1"

    def test_update_state(self, registry):
        entry = registry.register(profile_id="p1")
        registry.update_state(entry.session_uuid, SessionState.CONNECTED)
        updated = registry.get(entry.session_uuid)
        assert updated.state == SessionState.CONNECTED

    def test_get_active(self, registry):
        entry = registry.register(profile_id="p1")
        registry.update_state(entry.session_uuid, SessionState.CONNECTED)
        active = registry.get_active()
        assert active is not None
        assert active.session_uuid == entry.session_uuid

    def test_get_exposed(self, registry):
        entry = registry.register(profile_id="p1")
        registry.update_state(entry.session_uuid, SessionState.CONNECTED)
        exposed = registry.get_exposed()
        assert exposed is not None

    def test_remove(self, registry):
        entry = registry.register(profile_id="p1")
        registry.remove(entry.session_uuid)
        assert registry.get(entry.session_uuid) is None

    def test_single_exposed_constraint(self, registry):
        """Only one session may be in CONNECTED/CONNECTING state."""
        from shared.exceptions import SessionAlreadyExposedError
        entry1 = registry.register(profile_id="p1")
        registry.update_state(entry1.session_uuid, SessionState.CONNECTING)
        with pytest.raises(SessionAlreadyExposedError):
            registry.register(profile_id="p2")

    def test_get_by_profile(self, registry):
        entry = registry.register(profile_id="my-profile")
        found = registry.get_by_profile("my-profile")
        assert found is not None
        assert found.session_uuid == entry.session_uuid

    def test_get_state_model_disconnected_default(self, registry):
        model = registry.get_state_model()
        assert model.state == SessionState.DISCONNECTED
