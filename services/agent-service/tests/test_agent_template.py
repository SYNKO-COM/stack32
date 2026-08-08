"""M-D: generated agent template renders, lints, and its tests pass in-sandbox."""

from __future__ import annotations

from agent_service.builder.templates import render_agent_project
from agent_service.builder.templates.blueprint import default_blueprint
from agent_service.sandbox.base import SandboxConfig
from agent_service.sandbox.local import LocalSandbox


def test_render_produces_full_project():
    bp = default_blueprint(
        name="Appointment Helper",
        description="Manages appointment emails.",
        system_prompt="You manage appointments.",
        tool_names=["calculator", "current_datetime"],
    )
    files = render_agent_project(bp)
    paths = {f["path"] for f in files}
    for expected in (
        "agent.yaml",
        "pyproject.toml",
        "src/agent/orchestrator.py",
        "src/agent/prompts.py",
        "src/agent/tools.py",
        "src/agent/security.py",
        "src/agent/main.py",
        "tests/test_agent.py",
    ):
        assert expected in paths
    assert bp.slug == "appointment_helper"


def test_generated_python_is_syntactically_valid():
    import ast

    bp = default_blueprint(
        name="Calc Agent", description="calc", system_prompt="calc",
        tool_names=["calculator"],
    )
    for f in render_agent_project(bp):
        if f["path"].endswith(".py"):
            ast.parse(f["content"])  # raises on invalid syntax


async def test_generated_project_tests_pass_in_sandbox():
    """The strongest guarantee: run the generated project's own pytest."""
    bp = default_blueprint(
        name="Calc Agent", description="A calculator agent.",
        system_prompt="You compute expressions.", tool_names=["calculator", "current_datetime"],
    )
    provider = LocalSandbox()
    handle = await provider.create_workspace(SandboxConfig(command_timeout_seconds=60))
    try:
        for f in render_agent_project(bp):
            await provider.write_file(handle, f["path"], f["content"])
        # pyproject sets pythonpath=["src"]; runtime is installed in the interpreter.
        result = await provider.run_command(
            handle, ["python", "-m", "pytest", "-q"], timeout_seconds=60
        )
        assert result.ok, f"generated tests failed:\n{result.stdout}\n{result.stderr}"
        assert "passed" in result.stdout
    finally:
        await provider.destroy_workspace(handle)
