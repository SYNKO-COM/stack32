"""M-C: coding tool registry + deterministic loop (real sandbox, scripted model)."""

from __future__ import annotations

from agent_service.builder.coding import (
    CodingAgent,
    LoopDetector,
    ToolContext,
    WorkLedger,
    build_registry,
    fingerprint,
)
from agent_service.builder.coding.agent import ModelDecision
from agent_service.builder.context.engine import ContextEngine
from agent_service.sandbox.base import SandboxConfig
from agent_service.sandbox.local import LocalSandbox

BUGGY = "def add(a, b):\n    return a - b  # bug\n"
TEST = "from calc import add\n\n\ndef test_add():\n    assert add(2, 3) == 5\n"


def test_registry_namespaces():
    reg = build_registry()
    ids = reg.ids()
    assert "workspace.read_file" in ids
    assert "workspace.apply_patch" in ids
    assert "exec.run_tests" in ids
    assert "code.find_symbol" in ids
    schemas = reg.schemas_for(["workspace.read_file"])
    assert schemas[0]["function"]["name"] == "workspace.read_file"


def test_loop_detector():
    d = LoopDetector(max_identical=2)
    assert fingerprint("t", {"a": 1}) == fingerprint("t", {"a": 1})
    d.observe_call("t", {"a": 1})
    d.observe_call("t", {"a": 1})
    assert d.repeated_call("t", {"a": 1})
    assert d.reason() == "LOOP_DETECTED_REPEATED_CALL"


def test_work_ledger():
    led = WorkLedger(objective="x")
    led.set_plan(["a", "b"])
    assert led.plan[0].status == "running"
    led.advance_plan()
    assert led.plan[0].status == "done"
    assert led.plan[1].status == "running"
    led.add_fact("Tool registry at tools.py")
    assert "Tool registry at tools.py" in led.facts


async def test_apply_patch_exact_match():
    provider = LocalSandbox()
    handle = await provider.create_workspace(SandboxConfig())
    try:
        engine = ContextEngine(provider, handle)
        await provider.write_file(handle, "m.py", "x = 1\ny = 2\n")
        await engine.build()
        ctx = ToolContext(provider, handle, engine)
        reg = build_registry()
        tool = reg.get("workspace.apply_patch")
        res = await tool.run(ctx, {"path": "m.py", "old_string": "x = 1", "new_string": "x = 42"})
        assert res["ok"]
        content = await provider.read_file(handle, "m.py")
        assert "x = 42" in content
        # Ambiguous match rejected.
        await provider.write_file(handle, "d.py", "a\na\n")
        res2 = await tool.run(ctx, {"path": "d.py", "old_string": "a", "new_string": "b"})
        assert not res2["ok"]
    finally:
        await provider.destroy_workspace(handle)


async def test_full_coding_loop_write_fail_repair_pass():
    """End-to-end M-C: inspect -> run tests (fail) -> repair -> run tests (pass)."""
    provider = LocalSandbox()
    handle = await provider.create_workspace(SandboxConfig(command_timeout_seconds=30))
    try:
        await provider.write_file(handle, "calc.py", BUGGY)
        await provider.write_file(handle, "test_calc.py", TEST)
        engine = ContextEngine(provider, handle)

        events: list[str] = []

        async def emit(evt, payload):
            events.append(evt)

        # Scripted model: read -> run tests (fails) -> patch -> run tests (passes) -> finish.
        script = [
            ModelDecision("", [{"call_id": "1", "tool_id": "workspace.read_file", "arguments": {"path": "calc.py"}}]),
            ModelDecision("", [{"call_id": "2", "tool_id": "exec.run_tests", "arguments": {}}]),
            ModelDecision("", [{"call_id": "3", "tool_id": "workspace.apply_patch",
                                 "arguments": {"path": "calc.py", "old_string": "return a - b  # bug", "new_string": "return a + b"}}]),
            ModelDecision("", [{"call_id": "4", "tool_id": "exec.run_tests", "arguments": {}}]),
            ModelDecision("Fixed the add function; all tests pass.", []),
        ]
        calls = {"i": 0}

        async def model_fn(messages, tools):
            d = script[calls["i"]]
            calls["i"] += 1
            return d

        agent = CodingAgent(provider=provider, handle=handle, engine=engine, emit=emit, max_turns=10)
        result = await agent.run("Fix the add function so tests pass", system_prompt="test", model_fn=model_fn)

        assert result.success, result.stop_reason
        assert result.stop_reason == "COMPLETED"
        assert "calc.py" in result.files_touched
        assert result.ledger.verification["tests"] == "passed"
        assert "builder.tests.failed" in events
        assert "builder.tests.passed" in events
        # Verify the real file was actually repaired.
        final = await provider.read_file(handle, "calc.py")
        assert "return a + b" in final
    finally:
        await provider.destroy_workspace(handle)


async def test_loop_terminates_on_repeated_call():
    provider = LocalSandbox()
    handle = await provider.create_workspace(SandboxConfig())
    try:
        await provider.write_file(handle, "m.py", "x = 1\n")
        engine = ContextEngine(provider, handle)

        # Model keeps making the identical read call — should terminate on loop.
        async def model_fn(messages, tools):
            return ModelDecision("", [{"call_id": "1", "tool_id": "workspace.read_file", "arguments": {"path": "m.py"}}])

        agent = CodingAgent(provider=provider, handle=handle, engine=engine, max_turns=20)
        result = await agent.run("loop", system_prompt="t", model_fn=model_fn)
        assert not result.success
        assert "LOOP" in result.stop_reason
    finally:
        await provider.destroy_workspace(handle)
