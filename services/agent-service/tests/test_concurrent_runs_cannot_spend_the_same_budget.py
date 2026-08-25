"""A run's ceiling is what it reserved — not what it read.

Three simultaneous runs each read "remaining = $3" and each treated it as
their own. The reservation RPC serializes the arithmetic per user; the
Python side asks for its slice at run start and settles it at run end. When
the RPC itself is down the run falls back to the plain read — loudly —
because an infrastructure hiccup must not stop every build on the platform.
"""

from __future__ import annotations

import pytest

from agent_service.security import llm_budget as lb


class _Resp:
    def __init__(self, status_code: int, body):
        self.status_code = status_code
        self._body = body

    def json(self):
        return self._body


class _Client:
    def __init__(self, responses: dict[str, _Resp], raises: Exception | None = None):
        self._responses = responses
        self._raises = raises
        self.calls: list[tuple[str, dict]] = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False

    async def post(self, path: str, json=None):
        self.calls.append((path, json or {}))
        if self._raises:
            raise self._raises
        for key, resp in self._responses.items():
            if key in path:
                return resp
        return _Resp(404, None)


def _patch_client(monkeypatch, client: _Client):
    import agent_service.supabase_client as sc

    monkeypatch.setattr(sc, "get_supabase_admin_client", lambda: client)


class TestReservationDrivesTheCeiling:
    @pytest.mark.asyncio
    async def test_the_grant_is_returned(self, monkeypatch):
        client = _Client({"reserve_run_budget": _Resp(200, 1.25)})
        _patch_client(monkeypatch, client)
        granted = await lb._reserve_run_budget("r1", "u1", 2.0)
        assert granted == 1.25
        _path, payload = client.calls[0]
        assert payload == {"p_run_id": "r1", "p_user_id": "u1", "p_requested": 2.0}

    @pytest.mark.asyncio
    async def test_a_zero_grant_is_a_real_answer_not_a_failure(self, monkeypatch):
        client = _Client({"reserve_run_budget": _Resp(200, 0.0)})
        _patch_client(monkeypatch, client)
        assert await lb._reserve_run_budget("r1", "u1", 2.0) == 0.0

    @pytest.mark.asyncio
    async def test_an_rpc_outage_falls_back_to_none(self, monkeypatch):
        client = _Client({}, raises=RuntimeError("postgrest down"))
        _patch_client(monkeypatch, client)
        assert await lb._reserve_run_budget("r1", "u1", 2.0) is None

    @pytest.mark.asyncio
    async def test_settle_is_best_effort(self, monkeypatch):
        client = _Client({}, raises=RuntimeError("postgrest down"))
        _patch_client(monkeypatch, client)
        await lb._settle_run_budget("r1")  # must not raise


class TestTheMigrationCarriesTheInvariants:
    def _sql(self) -> str:
        import pathlib

        root = pathlib.Path(__file__).resolve().parents[3]
        return (root / "supabase/migrations/20260908000001_atomic_budget_reservation.sql").read_text()

    def test_reservations_are_serialized_per_user(self):
        assert "pg_advisory_xact_lock" in self._sql()

    def test_held_rows_expire_from_the_arithmetic(self):
        assert "interval '2 hours'" in self._sql()

    def test_a_zero_grant_does_not_stick(self):
        assert "v_existing > 0" in self._sql()

    def test_the_grant_never_exceeds_what_is_available(self):
        assert "least(greatest(coalesce(p_requested, v_available), 0), v_available)" in self._sql()
