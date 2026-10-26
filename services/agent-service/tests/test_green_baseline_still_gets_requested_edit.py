"""Passing old tests is not evidence that a requested modification was applied."""
from agent_service.builder.build_pipeline import CodeBuildPipeline
from agent_service.builder.coding.agent import ModelDecision
from agent_service.builder.templates import ProjectBlueprint, render_agent_project
from agent_service.sandbox.base import SandboxConfig
from agent_service.sandbox.local import LocalSandbox


async def workspace():
    provider = LocalSandbox()
    handle = await provider.create_workspace(SandboxConfig(command_timeout_seconds=30))
    blueprint = ProjectBlueprint(name="QA", slug="qa", description="QA", system_prompt="CALCULATE_V1", tools=[])
    files = render_agent_project(blueprint)
    for f in files:
        await provider.write_file(handle, f["path"], f["content"])
    return provider, handle, blueprint, files


async def test_green_project_is_actually_edited_and_new_test_is_retained():
    provider, handle, blueprint, files = await workspace()
    script = iter([
        ModelDecision("", [{"call_id": "1", "tool_id": "workspace.apply_patch", "arguments": {
            "path": "src/agent/prompts.py", "old_string": "CALCULATE_V1", "new_string": "CALCULATE_V2",
        }}]),
        ModelDecision("", [{"call_id": "2", "tool_id": "workspace.create_file", "arguments": {
            "path": "tests/test_requested_edit.py",
            "content": 'from agent.prompts import SYSTEM_PROMPT\n\n\ndef test_new_mission():\n    assert "CALCULATE_V2" in SYSTEM_PROMPT\n',
        }}]),
        ModelDecision("", [{"call_id": "3", "tool_id": "exec.run_tests", "arguments": {}}]),
        ModelDecision("", [{"call_id": "4", "tool_id": "exec.run_lint", "arguments": {}}]),
        ModelDecision("Applied and tested.")
    ])
    async def model(messages, tools, **kwargs):
        return next(script)
    try:
        report = await CodeBuildPipeline(provider=provider).build_from_workspace(
            handle=handle, blueprint=blueprint, files=files, user_id="qa", agent_id="qa", run_id="qa",
            persist=False, scaffolded=False, repair_objective="Change CALCULATE_V1 to CALCULATE_V2", repair_model_fn=model,
        )
        assert report.success and report.repaired, report.test_output
        assert "builder.tests.passed" in report.events  # baseline already passed
        saved = {f["path"]: f["content"] for f in report.files}
        assert "CALCULATE_V2" in saved["src/agent/prompts.py"]
        assert "tests/test_requested_edit.py" in saved
    finally:
        await provider.destroy_workspace(handle)


async def test_provider_failure_cannot_report_old_green_project_as_modified():
    provider, handle, blueprint, files = await workspace()
    async def unavailable(messages, tools, **kwargs):
        raise RuntimeError("provider unavailable")
    try:
        report = await CodeBuildPipeline(provider=provider).build_from_workspace(
            handle=handle, blueprint=blueprint, files=files, user_id="qa", agent_id="qa", run_id="qa",
            persist=False, scaffolded=False, repair_objective="Apply the new mission", repair_model_fn=unavailable,
        )
        assert not report.success
        assert "builder.ready" not in report.events
    finally:
        await provider.destroy_workspace(handle)
