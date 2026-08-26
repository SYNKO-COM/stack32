"""A poisoned checkpoint pool heals instead of failing every later run.

With a warm instance (min-instances=1) the process lives for hours; a pool
whose four connections were stuck once failed every subsequent run with
``PoolTimeout: couldn't get a connection after 30.00 sec``. Scale-to-zero
used to hide this by recycling the process. Now the pool outsizes the
worker's concurrency, fails fast, and an infrastructure failure resets it.
"""

from __future__ import annotations

import asyncio
import pathlib

from agent_service.runtime import langgraph_runtime

RUNTIME = (
    pathlib.Path(__file__).resolve().parents[1]
    / "agent_service/runtime/langgraph_runtime.py"
).read_text()
LIVE = (
    pathlib.Path(__file__).resolve().parents[1]
    / "agent_service/runtime/live.py"
).read_text()


class TestThePoolOutsizesTheWorker:
    def test_pool_is_larger_than_container_concurrency(self):
        # cloudbuild clones the worker with containerConcurrency: 5.
        assert "max_size=10" in RUNTIME

    def test_checkout_fails_fast_instead_of_hanging(self):
        assert "timeout=10" in RUNTIME


class TestAnInfraFailureResetsThePool:
    def test_live_runtime_wires_the_reset(self):
        infra_branch = LIVE.split('code = "RUNTIME_UNAVAILABLE"')[1].split("else:")[0]
        assert "reset_checkpointer()" in infra_branch

    def test_reset_clears_cache_and_closes_the_pool(self):
        closed = []

        class FakePool:
            async def close(self):
                closed.append(True)

        langgraph_runtime._checkpointers["postgres:test"] = object()
        langgraph_runtime._pg_pool = FakePool()
        asyncio.run(langgraph_runtime.reset_checkpointer())
        assert closed == [True]
        assert langgraph_runtime._checkpointers == {}
        assert langgraph_runtime._pg_pool is None

    def test_a_broken_close_does_not_raise(self):
        class BrokenPool:
            async def close(self):
                raise RuntimeError("socket already gone")

        langgraph_runtime._checkpointers["postgres:test"] = object()
        langgraph_runtime._pg_pool = BrokenPool()
        asyncio.run(langgraph_runtime.reset_checkpointer())
        assert langgraph_runtime._pg_pool is None


class TestEachRunOpensItsOwnConnection:
    """The primary checkpoint path holds no socket between requests."""

    def test_the_run_scoped_checkpointer_exists(self):
        assert "async def _run_checkpointer" in RUNTIME
        assert "psycopg.AsyncConnection.connect" in RUNTIME

    def test_the_invoke_site_uses_it(self):
        assert "async with _run_checkpointer() as checkpointer:" in RUNTIME

    def test_setup_runs_once_per_process(self):
        assert "_pg_setup_done" in RUNTIME


class TestNoNamedPreparedStatementsThroughThePooler:
    """Supavisor transaction mode shares backends; named statements collide."""

    def test_the_run_connection_never_prepares(self):
        runtime = (
            pathlib.Path(__file__).resolve().parents[1]
            / "agent_service/runtime/langgraph_runtime.py"
        ).read_text()
        assert "prepare_threshold=None" in runtime
        assert "prepare_threshold=0" not in runtime
        assert '"prepare_threshold": 0' not in runtime
