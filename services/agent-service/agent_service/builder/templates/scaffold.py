"""Real agent project scaffolding (M-D).

Renders a complete, runnable, tested Python project for a generated agent that
depends on `stack32-agent-runtime`. The output is a mapping of file paths to
contents, written into the sandbox by the Builder. The template always includes
passing tests so a generated project is verifiable out of the box.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Any

from stack32_agent_runtime import __version__ as RUNTIME_VERSION
from stack32_agent_runtime.patterns import AgentNeeds, Pattern, recommended_limits, select_pattern


@dataclass
class ToolBlueprint:
    name: str
    description: str
    input_schema: dict[str, Any]
    impl: str  # python function body returning a dict; receives `args`
    risk: str = "low"
    side_effect: bool = False


@dataclass
class ProjectBlueprint:
    name: str
    slug: str
    description: str
    system_prompt: str
    tools: list[ToolBlueprint] = field(default_factory=list)
    pattern: Pattern | None = None
    allowed_tools: list[str] = field(default_factory=list)

    def resolved_pattern(self) -> Pattern:
        if self.pattern:
            return self.pattern
        needs = AgentNeeds(
            tool_count=len(self.tools),
            has_side_effects=any(t.side_effect for t in self.tools),
        )
        return select_pattern(needs)


def slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")
    return slug or "agent"


def _agent_yaml(bp: ProjectBlueprint) -> str:
    pattern = bp.resolved_pattern()
    limits = recommended_limits(pattern)
    tools_yaml = "\n".join(
        f"  - name: {t.name}\n    risk: {t.risk}\n    side_effect: {str(t.side_effect).lower()}"
        for t in bp.tools
    )
    return (
        f"schema_version: 1\n"
        f"name: {bp.name}\n"
        f"slug: {bp.slug}\n"
        f"description: {json.dumps(bp.description)}\n"
        f"runtime:\n"
        f"  package: stack32-agent-runtime\n"
        f"  version: \"{RUNTIME_VERSION}\"\n"
        f"pattern: {pattern}\n"
        f"limits:\n"
        f"  max_turns: {limits['max_turns']}\n"
        f"  max_tool_calls: {limits['max_tool_calls']}\n"
        f"tools:\n{tools_yaml or '  []'}\n"
    )


# The generated project always ships a single internal package under src/.
# Ruff's isort config, the wheel packages list and the file map below all derive
# from this one name: if they ever disagree, ruff reports I001 on every freshly
# generated project and each build fails its lint gate at birth.
GENERATED_PACKAGE = "agent"


def _pyproject(bp: ProjectBlueprint) -> str:
    return (
        "[build-system]\n"
        'requires = ["hatchling"]\n'
        'build-backend = "hatchling.build"\n\n'
        "[project]\n"
        f'name = "{bp.slug}"\n'
        'version = "0.1.0"\n'
        f'description = {json.dumps(bp.description)}\n'
        'requires-python = ">=3.12"\n'
        "dependencies = [\n"
        f'    "stack32-agent-runtime=={RUNTIME_VERSION}",\n'
        '    "pydantic>=2.7",\n'
        "]\n\n"
        "[project.optional-dependencies]\n"
        'dev = ["pytest>=8.0", "pytest-asyncio>=0.24", "ruff>=0.6"]\n\n'
        "[tool.hatch.build.targets.wheel]\n"
        f'packages = ["src/{GENERATED_PACKAGE}"]\n\n'
        "[tool.pytest.ini_options]\n"
        'testpaths = ["tests"]\n'
        'asyncio_mode = "auto"\n'
        # "vendor" carries stack32_agent_runtime, which the sandbox image does not
        # provide. Without it pytest fails at import on every generated project.
        'pythonpath = ["src", "vendor"]\n\n'
        # Without this, ruff treats `agent` as third-party and reports I001 on
        # every freshly generated project — so each build failed the lint gate
        # at birth and entered a repair loop it could never win.
        "[tool.ruff]\n"
        'line-length = 100\n'
        'src = ["src", "tests"]\n'
        # Vendored runtime is not this project's code to lint.
        'exclude = ["vendor"]\n\n'
        "[tool.ruff.lint]\n"
        'select = ["E", "F", "I", "UP", "B"]\n'
        # Generated lines embed user-chosen tool names and example args, so their
        # width cannot be guaranteed. Line length on machine-written code buys
        # nothing and would fail the gate for a long tool name alone.
        'ignore = ["E501"]\n\n'
        "[tool.ruff.lint.isort]\n"
        f'known-first-party = ["{GENERATED_PACKAGE}"]\n'
    )


def _prompts(bp: ProjectBlueprint) -> str:
    return (
        '"""System instructions for this agent."""\n\n'
        f"SYSTEM_PROMPT = {json.dumps(bp.system_prompt)}\n"
    )


def _tools_module(bp: ProjectBlueprint) -> str:
    lines = [
        '"""Agent tool registry (generated)."""',
        "",
        "from __future__ import annotations",
        "",
        "from stack32_agent_runtime import ToolRegistry, ToolSpec",
        "",
        "",
    ]
    for t in bp.tools:
        body = "\n".join("    " + ln for ln in t.impl.strip("\n").splitlines())
        lines.append(f"async def _{t.name}(args):")
        lines.append(body)
        lines.append("")
        lines.append("")
    lines.append("def build_registry() -> ToolRegistry:")
    lines.append("    registry = ToolRegistry()")
    for t in bp.tools:
        lines.append("    registry.register(")
        lines.append("        ToolSpec(")
        lines.append(f"            name={json.dumps(t.name)},")
        lines.append(f"            description={json.dumps(t.description)},")
        lines.append(f"            input_schema={json.dumps(t.input_schema)},")
        lines.append(f"            fn=_{t.name},")
        lines.append(f"            risk={json.dumps(t.risk)},")
        lines.append(f"            side_effect={t.side_effect},")
        lines.append("        )")
        lines.append("    )")
    lines.append("    return registry")
    lines.append("")
    return "\n".join(lines)


def _security_module(bp: ProjectBlueprint) -> str:
    allowed = bp.allowed_tools or [t.name for t in bp.tools]
    approvals = {t.name: "always" for t in bp.tools if t.side_effect}
    return (
        '"""Security policy for this agent (enforced outside the model)."""\n\n'
        "from __future__ import annotations\n\n"
        "from stack32_agent_runtime import SecurityPolicy\n\n\n"
        "def build_policy() -> SecurityPolicy:\n"
        f"    return SecurityPolicy(\n"
        f"        allowed_tools={set(allowed)!r},\n"
        f"        approvals={approvals!r},\n"
        "    )\n"
    )


def _orchestrator_module(bp: ProjectBlueprint) -> str:
    return (
        '"""Agent orchestrator wiring (generated)."""\n\n'
        "from __future__ import annotations\n\n"
        "from stack32_agent_runtime import Orchestrator, OrchestratorConfig, RuntimeLimits\n"
        "from stack32_agent_runtime.patterns import recommended_limits\n\n"
        "from agent.prompts import SYSTEM_PROMPT\n"
        "from agent.security import build_policy\n"
        "from agent.tools import build_registry\n\n"
        f"PATTERN = {json.dumps(bp.resolved_pattern())}\n\n\n"
        "def build_orchestrator(model, *, tracer=None, approver=None) -> Orchestrator:\n"
        "    limits_kwargs = recommended_limits(PATTERN)\n"
        "    config = OrchestratorConfig(\n"
        "        system_prompt=SYSTEM_PROMPT,\n"
        "        limits=RuntimeLimits(**limits_kwargs),\n"
        "        policy=build_policy(),\n"
        "    )\n"
        "    return Orchestrator(\n"
        "        model=model,\n"
        "        tools=build_registry(),\n"
        "        config=config,\n"
        "        tracer=tracer,\n"
        "        approver=approver,\n"
        "    )\n"
    )


def _main_module(bp: ProjectBlueprint) -> str:
    return (
        '"""Entrypoint for the generated agent."""\n\n'
        "from __future__ import annotations\n\n"
        "from agent.orchestrator import build_orchestrator\n\n\n"
        "async def run(objective: str, *, model, tracer=None, approver=None):\n"
        '    """Run the agent against an objective using an injected ModelAdapter."""\n'
        "    orchestrator = build_orchestrator(model, tracer=tracer, approver=approver)\n"
        "    state = await orchestrator.run(objective)\n"
        "    return state\n"
    )


def _memory_module() -> str:
    return (
        '"""Optional memory for this agent."""\n\n'
        "from stack32_agent_runtime import InMemorySemanticMemory\n\n\n"
        "def build_memory():\n"
        "    return InMemorySemanticMemory()\n"
    )


def _test_module(bp: ProjectBlueprint) -> str:
    """Generate an offline test that drives the agent with a scripted model."""
    first_tool = bp.tools[0] if bp.tools else None
    if first_tool is None:
        return (
            "from stack32_agent_runtime.model import ModelResponse\n\n"
            "from agent.main import run\n\n\n"
            "class ScriptedModel:\n"
            "    def __init__(self, script):\n"
            "        self.script = script\n"
            "        self.i = 0\n\n"
            "    async def call(self, messages, tools):\n"
            "        r = self.script[self.i]\n"
            "        self.i += 1\n"
            "        return r\n\n\n"
            "async def test_agent_completes():\n"
            "    model = ScriptedModel([ModelResponse(content='done')])\n"
            "    state = await run('hello', model=model)\n"
            "    assert state.terminal\n"
            "    assert state.final_output == 'done'\n"
        )
    example_args = _example_args(first_tool.input_schema)
    return (
        "from stack32_agent_runtime.model import ModelResponse\n\n"
        "from agent.main import run\n"
        "from agent.tools import build_registry\n\n\n"
        "class ScriptedModel:\n"
        "    def __init__(self, script):\n"
        "        self.script = script\n"
        "        self.i = 0\n\n"
        "    async def call(self, messages, tools):\n"
        "        r = self.script[self.i]\n"
        "        self.i += 1\n"
        "        return r\n\n\n"
        "def test_registry_has_tools():\n"
        "    reg = build_registry()\n"
        f"    assert {json.dumps(first_tool.name)} in reg.names()\n\n\n"
        "async def test_agent_makes_tool_call():\n"
        "    model = ScriptedModel([\n"
        f"        ModelResponse(tool_calls=[{{'call_id': '1', 'tool_id': {json.dumps(first_tool.name)}, 'arguments': {example_args!r}}}]),\n"
        "        ModelResponse(content='completed'),\n"
        "    ])\n"
        "    state = await run('do the task', model=model)\n"
        "    assert state.terminal\n"
        "    assert state.tool_call_count == 1\n"
        "    assert state.observations[0].content is not None\n"
    )


def _example_args(schema: dict[str, Any]) -> dict[str, Any]:
    props = schema.get("properties", {})
    out: dict[str, Any] = {}
    for key in schema.get("required", list(props)):
        typ = props.get(key, {}).get("type", "string")
        out[key] = {"number": 1, "integer": 1, "boolean": True, "array": [], "object": {}}.get(typ, "x")
    return out


def _readme(bp: ProjectBlueprint) -> str:
    return (
        f"# {bp.name}\n\n{bp.description}\n\n"
        f"Generated by Stack32 Builder. Runtime: `stack32-agent-runtime=={RUNTIME_VERSION}`.\n\n"
        f"Pattern: `{bp.resolved_pattern()}`.\n\n"
        "## Run tests\n\n```bash\npip install -e \".[dev]\"\npytest -q\n```\n"
    )


def render_agent_project(bp: ProjectBlueprint) -> list[dict[str, str]]:
    """Return [{path, content, content_type}] for a complete agent project."""
    files = {
        "agent.yaml": _agent_yaml(bp),
        "pyproject.toml": _pyproject(bp),
        "README.md": _readme(bp),
        "src/agent/__init__.py": '"""Generated agent package."""\n',
        "src/agent/prompts.py": _prompts(bp),
        "src/agent/tools.py": _tools_module(bp),
        "src/agent/security.py": _security_module(bp),
        "src/agent/orchestrator.py": _orchestrator_module(bp),
        "src/agent/main.py": _main_module(bp),
        "src/agent/memory.py": _memory_module(),
        "tests/__init__.py": "",
        "tests/test_agent.py": _test_module(bp),
    }

    def _ctype(path: str) -> str:
        if path.endswith(".py"):
            return "text/x-python"
        if path.endswith(".yaml"):
            return "text/yaml"
        if path.endswith(".toml"):
            return "text/x-toml"
        if path.endswith(".md"):
            return "text/markdown"
        return "text/plain"

    return [{"path": p, "content": c, "content_type": _ctype(p)} for p, c in files.items()]
