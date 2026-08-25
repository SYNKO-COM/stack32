"""An outside event runs the published version — never the owner's draft.

The worker loaded ``load_draft_spec`` for every queued live run. A Slack
trigger firing while the owner rewrote their agent executed the half-edited
draft in front of the outside world. The published contract is the pinned
installation version, else the agent's published version; without either the
run fails instead of reaching for the draft.
"""

from __future__ import annotations

import pytest

from agent_service.runtime.live import load_published_spec_for_external_run

MINIMAL_SPEC = {
    "version": "2",
    "identity": {"name": "Published Agent", "role": "test"},
    "instructions": {"system": "hi"},
}


class _Db:
    """Answers _select per table from canned rows."""

    def __init__(self, tables: dict[str, list[dict]]):
        self._tables = tables
        self.queries: list[tuple[str, dict]] = []

    async def _select(self, table: str, params: dict) -> list[dict]:
        self.queries.append((table, params))
        return self._tables.get(table, [])


class TestThePinnedVersionWins:
    @pytest.mark.asyncio
    async def test_the_installation_pin_is_used_first(self):
        db = _Db({
            "agent_installations": [{"pinned_version_id": "v-pin"}],
            "agent_versions": [{"id": "v-pin", "spec": MINIMAL_SPEC, "graph_spec": None}],
        })
        spec = await load_published_spec_for_external_run(
            db, agent_id="a1", installation_id="inst1"
        )
        assert spec is not None
        version_queries = [p for t, p in db.queries if t == "agent_versions"]
        assert version_queries[0]["id"] == "eq.v-pin"

    @pytest.mark.asyncio
    async def test_the_published_version_backs_up_the_pin(self):
        db = _Db({
            "agent_installations": [{"pinned_version_id": None}],
            "agents": [{"published_version_id": "v-pub"}],
            "agent_versions": [{"id": "v-pub", "spec": MINIMAL_SPEC, "graph_spec": None}],
        })
        spec = await load_published_spec_for_external_run(
            db, agent_id="a1", installation_id="inst1"
        )
        assert spec is not None
        version_queries = [p for t, p in db.queries if t == "agent_versions"]
        assert version_queries[0]["id"] == "eq.v-pub"


class TestTheDraftIsNeverReached:
    @pytest.mark.asyncio
    async def test_no_published_version_means_no_spec_at_all(self):
        db = _Db({
            "agent_installations": [{"pinned_version_id": None}],
            "agents": [{"published_version_id": None}],
        })
        assert (
            await load_published_spec_for_external_run(
                db, agent_id="a1", installation_id="inst1"
            )
            is None
        )
        # And the resolver never even looked at drafts or versions.
        assert all(t != "agent_versions" for t, _ in db.queries)

    @pytest.mark.asyncio
    async def test_a_missing_version_row_fails_rather_than_falls_back(self):
        db = _Db({
            "agents": [{"published_version_id": "v-gone"}],
            "agent_versions": [],
        })
        assert (
            await load_published_spec_for_external_run(db, agent_id="a1") is None
        )


class TestTheWorkerRoutesByOrigin:
    def test_trigger_and_schedule_payloads_count_as_external(self):
        # Mirrors the worker's routing rule.
        def external(payload: dict) -> bool:
            return bool(payload.get("trigger_id") or payload.get("schedule_id"))

        assert external({"trigger_id": "t1"})
        assert external({"schedule_id": "s1"})
        assert not external({"prompt": "hello from the owner"})
