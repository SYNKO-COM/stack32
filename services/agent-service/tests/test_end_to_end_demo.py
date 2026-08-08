"""End-to-end demonstration (m-f-demo).

Exercises the full vertical slice with REAL execution (no mocks of the sandbox
or the generated code):

  request -> sandbox project -> real files -> build agent code -> run tests
  -> encounter failure -> repair -> snapshot -> executable structure
  -> run the generated agent -> genuine structured tool call
  -> orchestrator executes tool -> observation -> success.
"""

from __future__ import annotations

from agent_service.builder.build_pipeline import CodeBuildPipeline
from agent_service.builder.coding.agent import ModelDecision
from agent_service.builder.templates.scaffold import ProjectBlueprint, ToolBlueprint
from agent_service.sandbox.base import SandboxConfig
from agent_service.sandbox.local import LocalSandbox

# A blueprint whose "add_numbers" tool ships a deliberate bug (subtraction),
# plus a correctness test that will fail until the bug is repaired.
BUGGY_ADD = ToolBlueprint(
    name="add_numbers",
    description="Add two numbers.",
    input_schema={
        "type": "object",
        "properties": {"a": {"type": "number"}, "b": {"type": "number"}},
        "required": ["a", "b"],
    },
    impl="return {'result': args['a'] - args['b']}",  # BUG: should be +
)

CORRECTNESS_TEST = (
    "from agent.tools import build_registry\n\n\n"
    "async def test_add_is_correct():\n"
    "    reg = build_registry()\n"
    "    result = await reg.get('add_numbers').fn({'a': 2, 'b': 3})\n"
    "    assert result['result'] == 5\n"
)

RUN_DEMO = (
    "import asyncio\n"
    "import json\n"
    "import sys\n"
    "sys.path.insert(0, 'src')\n"
    "from stack32_agent_runtime.model import ModelResponse\n"
    "from agent.main import run\n\n\n"
    "class ScriptedModel:\n"
    "    def __init__(self):\n"
    "        self.i = 0\n\n"
    "    async def call(self, messages, tools):\n"
    "        self.i += 1\n"
    "        if self.i == 1:\n"
    "            return ModelResponse(tool_calls=[{'call_id': '1', 'tool_id': 'add_numbers', 'arguments': {'a': 2, 'b': 3}}])\n"
    "        return ModelResponse(content='The result is 5.')\n\n\n"
    "async def main():\n"
    "    state = await run('add 2 and 3', model=ScriptedModel())\n"
    "    print('FINAL:' + str(state.final_output))\n"
    "    print('OBS:' + json.dumps(state.observations[0].content))\n"
    "    print('TOOLCALLS:' + str(state.tool_call_count))\n\n\n"
    "asyncio.run(main())\n"
)


async def test_full_end_to_end_demo(capsys):
    provider = LocalSandbox()
    pipeline = CodeBuildPipeline(provider=provider)

    blueprint = ProjectBlueprint(
        name="Sum Agent",
        slug="sum_agent",
        description="An agent that adds numbers via a tool.",
        system_prompt="You add numbers using the add_numbers tool.",
        tools=[BUGGY_ADD],
    )

    # Scripted repair: read -> tests (fail) -> patch the bug -> tests (pass) -> done.
    repair_script = [
        ModelDecision("", [{"call_id": "1", "tool_id": "workspace.read_file", "arguments": {"path": "src/agent/tools.py"}}]),
        ModelDecision("", [{"call_id": "2", "tool_id": "exec.run_tests", "arguments": {}}]),
        ModelDecision("", [{"call_id": "3", "tool_id": "workspace.apply_patch", "arguments": {
            "path": "src/agent/tools.py",
            "old_string": "args['a'] - args['b']",
            "new_string": "args['a'] + args['b']",
        }}]),
        ModelDecision("", [{"call_id": "4", "tool_id": "exec.run_tests", "arguments": {}}]),
        ModelDecision("Repaired add_numbers; tests pass.", []),
    ]
    idx = {"i": 0}

    async def repair_model_fn(messages, tools):
        d = repair_script[idx["i"]]
        idx["i"] += 1
        return d

    # Seed the workspace with a failing correctness test so the build genuinely
    # fails before the coding loop repairs it.
    report = await _build_with_extra_test(pipeline, blueprint, repair_model_fn)

    # --- assertions covering every demo stage ---
    assert report.repaired, f"expected a repair; stop={report.stop_reason}"
    assert report.success and report.test_status == "passed"
    assert "builder.tests.failed" in report.events  # a real failure occurred
    assert "builder.tests.passed" in report.events  # ...and was repaired
    assert "src/agent/orchestrator.py" in report.structure  # real executable structure

    # Run the generated agent for real inside the sandbox: it must make a
    # genuine structured tool call executed by its own orchestrator.
    await provider.write_file(report.handle, "run_demo.py", RUN_DEMO)
    run = await provider.run_command(report.handle, ["python", "run_demo.py"], timeout_seconds=60)
    assert run.ok, f"generated agent run failed:\n{run.stdout}\n{run.stderr}"
    assert "OBS:{\"result\": 5}" in run.stdout
    assert "TOOLCALLS:1" in run.stdout
    assert "FINAL:The result is 5." in run.stdout

    # Print the demo transcript (visible with -s) for the human demo.
    print("\n=== STACK32 END-TO-END DEMO ===")
    print("Structure:")
    for path in report.structure:
        print(f"  {path}")
    print(f"Tests: {report.test_status} (repaired={report.repaired})")
    print("Generated agent run output:")
    print(run.stdout)

    await provider.destroy_workspace(report.handle)


async def _build_with_extra_test(pipeline, blueprint, repair_model_fn):
    """Render + inject a failing correctness test, then run the pipeline steps.

    We reuse the pipeline but seed the workspace with the failing test so the
    build genuinely fails before repair.
    """
    from agent_service.builder.templates import render_agent_project

    provider = pipeline.provider
    handle = await provider.create_workspace(SandboxConfig(command_timeout_seconds=60))

    # Monkey-inject: write scaffold + the failing correctness test up front,
    # then let the pipeline's verify/repair/snapshot logic run against it.
    files = render_agent_project(blueprint)
    files.append({"path": "tests/test_correctness.py", "content": CORRECTNESS_TEST, "content_type": "text/x-python"})
    for f in files:
        await provider.write_file(handle, f["path"], f["content"])

    return await pipeline.build_from_workspace(
        handle=handle,
        blueprint=blueprint,
        files=files,
        user_id="demo-user",
        agent_id="demo-agent",
        run_id="demo-run",
        repair_model_fn=repair_model_fn,
    )
