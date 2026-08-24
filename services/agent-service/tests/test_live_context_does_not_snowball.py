"""A run's context is its own, not the pile of every run before it.

Measured live: the seed of a support-ticket run weighed ~5.5k tokens
(system 3.2k chars, turn 626, 14 tool schemas ≈ 4.5k tokens — the same
payload replayed locally cost 4,483 prompt tokens on both sol and terra,
platform key or user key alike). OpenAI billed 46,526. The difference was
the LangGraph checkpointer: compiled with a thread id stable across runs,
it reloaded every previous run's messages and operator.add stacked the new
seed on top, growing without bound.
"""

from agent_service.runtime.langgraph_runtime import stable_live_thread_id


def test_two_runs_on_one_trigger_get_two_checkpoint_threads():
    a = stable_live_thread_id("thread-1", "run-a")
    b = stable_live_thread_id("thread-1", "run-b")
    assert a != b


def test_the_run_scope_still_names_the_thread():
    scoped = stable_live_thread_id("thread-1", "run-a")
    assert "thread-1" in scoped and "run-a" in scoped


def test_the_invocation_passes_the_run_id():
    import inspect

    from agent_service.runtime import langgraph_runtime

    src = inspect.getsource(langgraph_runtime)
    assert "stable_live_thread_id(thread_id, run_id)" in src


def test_legacy_callers_without_a_run_keep_the_old_shape():
    assert stable_live_thread_id("thread-1") == "live:thread-1"
