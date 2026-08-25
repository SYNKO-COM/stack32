"""A run must not die because its checkpoint connection went idle.

Scheduled runs arrive hours apart and Cloud Run freezes the instance between
them, so Postgres drops the socket. The checkpointer used to hold one
connection for the life of the process and met a corpse on the next run:
`OperationalError: the connection is closed`, surfaced to the owner as
TOOL_FAILED even though no tool had run.
"""

from __future__ import annotations

import inspect

from agent_service.runtime.langgraph_runtime import _open_checkpoint_pool
from agent_service.runtime.live import _is_infrastructure_error


class _OperationalError(Exception):
    """Stands in for psycopg's, which is matched by name."""


def test_pool_verifies_a_connection_before_lending_it() -> None:
    """Without the check, a dead connection is handed out and the run fails."""
    source = inspect.getsource(_open_checkpoint_pool)
    assert "check=AsyncConnectionPool.check_connection" in source
    # A connection kept forever is the bug itself.
    assert "max_lifetime" in source
    assert "max_idle" in source


def test_pool_keeps_the_kwargs_the_saver_depends_on() -> None:
    """AsyncPostgresSaver's queries assume how from_conn_string opens a connection."""
    source = inspect.getsource(_open_checkpoint_pool)
    for required in ('"autocommit": True', '"prepare_threshold": 0', '"row_factory": dict_row'):
        assert required in source


def test_a_closed_connection_is_not_blamed_on_the_agent() -> None:
    exc = _OperationalError("the connection is closed")
    assert _is_infrastructure_error(exc, "the connection is closed")


def test_other_database_faults_are_infrastructure_too() -> None:
    for text in (
        "server closed the connection unexpectedly",
        "consuming input failed: EOF detected",
        "SSL connection has been closed unexpectedly",
        "terminating connection due to administrator command",
    ):
        assert _is_infrastructure_error(Exception("boom"), text), text


def test_real_tool_failures_stay_tool_failures() -> None:
    """The classifier must not swallow faults the agent's own tools produced."""
    for text in (
        "Search provider error.",
        "Too many redirects.",
        "gmail returned 403 insufficient permissions",
        "PIPEDREAM_ACTION_FAILED",
    ):
        assert not _is_infrastructure_error(Exception("boom"), text), text
