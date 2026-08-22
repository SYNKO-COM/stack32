"""A freshly generated agent project must pass its own quality gates.

This is the regression that made the product feel broken. The scaffold shipped
without a [tool.ruff] section, so ruff treated `agent` as third-party and
reported I001 on every project. Every build therefore failed the lint gate at
birth, entered the repair loop, and — with max_identical_fingerprints stuck at
its default of 2 — stopped after a single attempt with
REPEATED_FINGERPRINT_NO_PROGRESS. Clicking "Corriger pour moi" replayed the
identical failure forever while burning credits.

These tests run the real sandbox: real files, real ruff, real pytest.
"""

from __future__ import annotations

import pytest

from agent_service.builder.coding.tools import ToolContext, build_registry
from agent_service.builder.context.engine import ContextEngine
from agent_service.builder.templates import render_agent_project
from agent_service.builder.templates.scaffold import ProjectBlueprint, ToolBlueprint
from agent_service.sandbox.base import SandboxConfig
from agent_service.sandbox.local import LocalSandbox

SIMPLE_TOOL = ToolBlueprint(
    name="add_numbers",
    description="Add two numbers.",
    input_schema={
        "type": "object",
        "properties": {"a": {"type": "number"}, "b": {"type": "number"}},
        "required": ["a", "b"],
    },
    impl="return {'result': args['a'] + args['b']}",
)

# A deliberately awkward name: generated lines embed it, so line width cannot be
# guaranteed and E501 must not gate machine-written code.
LONG_NAME_TOOL = ToolBlueprint(
    name="summarize_customer_support_conversation_transcript",
    description="Summarize a very long support transcript for a reviewer.",
    input_schema={
        "type": "object",
        "properties": {"transcript": {"type": "string"}, "max_sentences": {"type": "number"}},
        "required": ["transcript"],
    },
    impl="return {'summary': args['transcript'][:200]}",
)


async def _materialize(tools):
    blueprint = ProjectBlueprint(
        name="Born Clean Agent",
        slug="born_clean_agent",
        description="Verifies a fresh scaffold passes its own gates.",
        system_prompt="You help the user.",
        tools=tools,
    )
    provider = LocalSandbox()
    handle = await provider.create_workspace(SandboxConfig(command_timeout_seconds=90))
    files = render_agent_project(blueprint)
    for f in files:
        await provider.write_file(handle, f["path"], f["content"])
    registry = build_registry()
    ctx = ToolContext(provider, handle, ContextEngine(provider, handle))
    return provider, handle, registry, ctx


@pytest.mark.parametrize(
    ("label", "tools"),
    [("single simple tool", [SIMPLE_TOOL]), ("long tool name", [LONG_NAME_TOOL])],
)
async def test_fresh_scaffold_passes_lint_and_tests(label, tools):
    provider, handle, registry, ctx = await _materialize(tools)
    try:
        lint = await registry.get("exec.run_lint").run(ctx, {})
        assert lint.get("ok"), (
            f"[{label}] a brand-new project failed lint, which sends every build "
            f"straight into the repair loop:\n{lint.get('stdout') or lint.get('stderr')}"
        )
        tests = await registry.get("exec.run_tests").run(ctx, {})
        assert tests.get("ok"), (
            f"[{label}] a brand-new project failed its own tests:\n"
            f"{tests.get('stdout') or tests.get('stderr')}"
        )
    finally:
        await provider.destroy_workspace(handle)


async def test_generated_pyproject_declares_agent_as_first_party():
    """Without this, ruff sorts `agent` as third-party and reports I001."""
    blueprint = ProjectBlueprint(
        name="Cfg", slug="cfg", description="d", system_prompt="s", tools=[SIMPLE_TOOL]
    )
    pyproject = next(
        f["content"] for f in render_agent_project(blueprint) if f["path"] == "pyproject.toml"
    )
    assert "[tool.ruff.lint.isort]" in pyproject
    assert 'known-first-party = ["agent"]' in pyproject
    assert 'ignore = ["E501"]' in pyproject
