"""Readiness may only promise what the runtime will actually deliver.

The coverage helper used to ingest every active account on the user after
reading the real agent bindings — "owner convenience". The runtime never does
that: an unbound user-level account is refused with CONNECTION_REQUIRED. So
readiness said "Slack available" for agents whose first real Slack call
failed. Coverage now counts bound connections only.
"""

from __future__ import annotations

import pytest

from agent_service.readiness import evaluator as ev


class _Mgr:
    def __init__(self, bindings, connections):
        self._bindings = bindings
        self._connections = connections

    async def list_bindings(self, **_kw):
        return self._bindings

    async def list_connections(self, **_kw):
        return self._connections


def _patch_manager(monkeypatch, bindings, connections):
    class _Module:
        ConnectionManager = lambda: _Mgr(bindings, connections)  # noqa: E731

    import agent_service.connections.manager as real

    monkeypatch.setattr(real, "ConnectionManager", lambda: _Mgr(bindings, connections))


SLACK_CONN = {
    "id": "c-slack",
    "provider": "pipedream",
    "status": "active",
    "provider_metadata": {"app_id": "slack"},
}


class TestUnboundAccountsDoNotCount:
    @pytest.mark.asyncio
    async def test_a_global_account_without_binding_is_invisible(self, monkeypatch):
        _patch_manager(monkeypatch, bindings=[], connections=[SLACK_CONN])
        providers, apps, coverage = await ev._agent_bound_coverage("u1", "a1")
        assert apps == set()
        assert providers == set()
        assert coverage == {}

    @pytest.mark.asyncio
    async def test_a_bound_account_still_counts(self, monkeypatch):
        _patch_manager(
            monkeypatch,
            bindings=[{"connection_id": "c-slack", "enabled": True, "tool_ids": ["pd:slack_v2-send-message"]}],
            connections=[SLACK_CONN],
        )
        providers, apps, coverage = await ev._agent_bound_coverage("u1", "a1")
        assert "slack" in apps
        assert "pipedream" in providers
        assert coverage.get("pd:slack_v2-send-message") == {"pipedream"}

    @pytest.mark.asyncio
    async def test_a_disabled_binding_does_not_count(self, monkeypatch):
        _patch_manager(
            monkeypatch,
            bindings=[{"connection_id": "c-slack", "enabled": False, "tool_ids": ["pd:slack_v2-send-message"]}],
            connections=[SLACK_CONN],
        )
        _, apps, _ = await ev._agent_bound_coverage("u1", "a1")
        assert apps == set()


class TestUnknownIsNamedUnknown:
    def test_the_skipped_build_check_no_longer_reads_as_verified(self):
        import pathlib

        src = (
            pathlib.Path(ev.__file__)
        ).read_text()
        assert "Build status not provided; skipped." not in src
        assert "not treated as verification" in src
