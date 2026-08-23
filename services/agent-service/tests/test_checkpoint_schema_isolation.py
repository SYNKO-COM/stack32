"""The checkpointer must say so when its tables are not where we think.

Forcing `search_path=agent_runtime,public` only routes *new* tables. Where a
`public.checkpoints` already existed, LangGraph's idempotent setup() found it on
the search_path and kept writing there — and `public` is the schema PostgREST
exposes. The isolation silently did not hold, and nothing reported it.
"""

import logging

import pytest

from agent_service.runtime.langgraph_runtime import (
    CHECKPOINT_SCHEMA,
    _warn_if_checkpoints_escaped_the_runtime_schema,
    _with_checkpoint_search_path,
)


class FakeCursor:
    def __init__(self, rows):
        self._rows = rows

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def execute(self, _sql):
        return None

    async def fetchall(self):
        return self._rows


class FakeConn:
    def __init__(self, rows=(), fail=False):
        self._rows = list(rows)
        self._fail = fail

    def cursor(self):
        if self._fail:
            raise RuntimeError("connection is gone")
        return FakeCursor(self._rows)


class FakeSaver:
    def __init__(self, conn=None):
        self.conn = conn


@pytest.mark.asyncio
async def test_checkpoints_left_in_public_are_reported_as_an_error(caplog):
    caplog.set_level(logging.ERROR)
    await _warn_if_checkpoints_escaped_the_runtime_schema(
        FakeSaver(FakeConn([("public",)]))
    )
    assert any(
        record.levelno == logging.ERROR and "public" in record.getMessage()
        for record in caplog.records
    )


@pytest.mark.asyncio
async def test_checkpoints_in_the_runtime_schema_say_nothing(caplog):
    caplog.set_level(logging.WARNING)
    await _warn_if_checkpoints_escaped_the_runtime_schema(
        FakeSaver(FakeConn([(CHECKPOINT_SCHEMA,)]))
    )
    assert caplog.records == []


@pytest.mark.asyncio
async def test_a_third_schema_is_worth_a_warning_but_not_an_error(caplog):
    caplog.set_level(logging.WARNING)
    await _warn_if_checkpoints_escaped_the_runtime_schema(
        FakeSaver(FakeConn([("somewhere_else",)]))
    )
    assert [r.levelno for r in caplog.records] == [logging.WARNING]


@pytest.mark.asyncio
async def test_a_broken_probe_never_keeps_the_service_down(caplog):
    caplog.set_level(logging.WARNING)
    await _warn_if_checkpoints_escaped_the_runtime_schema(
        FakeSaver(FakeConn(fail=True))
    )
    assert caplog.records == []


@pytest.mark.asyncio
async def test_a_saver_without_a_connection_is_not_probed():
    # MemorySaver in dev and tests has no `conn`; the probe must simply pass.
    await _warn_if_checkpoints_escaped_the_runtime_schema(FakeSaver(None))
    await _warn_if_checkpoints_escaped_the_runtime_schema(object())


def test_the_runtime_schema_still_leads_the_search_path():
    scoped = _with_checkpoint_search_path("postgresql://u:p@host:5432/db")
    assert f"search_path%3D{CHECKPOINT_SCHEMA}%2Cpublic" in scoped
