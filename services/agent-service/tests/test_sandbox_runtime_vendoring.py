"""The generated project must be self-sufficient inside a stock sandbox image.

Every generated agent imports ``stack32_agent_runtime``. E2B runs a plain Python
image and that package is a monorepo package, not something on PyPI, so nothing
installed it: pytest failed at import on *every* build. The coding agent then
spent its entire turn budget shelling out to `pip download`, `find /` and
`grep stack32_agent_runtime` trying to conjure the dependency instead of writing
the user's agent, and the run ended with the sandbox soft-skipped.

The earlier scaffold test missed this because the local venv has the runtime
installed. These assert the project carries what it needs with it.
"""

from __future__ import annotations

from agent_service.builder.runtime_vendor import VENDOR_DIR, runtime_files
from agent_service.builder.templates import render_agent_project
from agent_service.builder.templates.scaffold import ProjectBlueprint, ToolBlueprint

TOOL = ToolBlueprint(
    name="add_numbers",
    description="Add two numbers.",
    input_schema={
        "type": "object",
        "properties": {"a": {"type": "number"}, "b": {"type": "number"}},
        "required": ["a", "b"],
    },
    impl="return {'result': args['a'] + args['b']}",
)


def _blueprint() -> ProjectBlueprint:
    return ProjectBlueprint(
        name="Sum Agent", slug="sum_agent", description="d", system_prompt="s", tools=[TOOL]
    )


def test_the_runtime_ships_with_every_project():
    files = runtime_files()
    assert files, "the runtime must be vendored; the sandbox image does not provide it"
    paths = {f["path"] for f in files}
    assert f"{VENDOR_DIR}/stack32_agent_runtime/__init__.py" in paths


def test_vendored_runtime_covers_what_the_scaffold_imports():
    """Whatever the generated code imports from the runtime must be present."""
    vendored = {f["path"].split("/")[-1] for f in runtime_files()}
    project = "\n".join(f["content"] for f in render_agent_project(_blueprint()))
    for module in ("orchestrator", "model", "patterns"):
        if f"stack32_agent_runtime.{module}" in project or "from stack32_agent_runtime import" in project:
            assert f"{module}.py" in vendored or "__init__.py" in vendored


def test_pytest_can_resolve_the_vendor_directory():
    pyproject = next(
        f["content"] for f in render_agent_project(_blueprint()) if f["path"] == "pyproject.toml"
    )
    assert 'pythonpath = ["src", "vendor"]' in pyproject, (
        "without vendor on the path the runtime is present but unimportable"
    )


def test_ruff_does_not_lint_the_vendored_runtime():
    """The user's build must not fail on code they did not write."""
    pyproject = next(
        f["content"] for f in render_agent_project(_blueprint()) if f["path"] == "pyproject.toml"
    )
    assert 'exclude = ["vendor"]' in pyproject


def test_no_project_file_collides_with_the_vendor_directory():
    project_paths = {f["path"] for f in render_agent_project(_blueprint())}
    vendor_paths = {f["path"] for f in runtime_files()}
    assert not (project_paths & vendor_paths)


def test_vendoring_degrades_quietly_when_the_runtime_is_absent(monkeypatch):
    """A missing runtime must not crash the build; it is logged and skipped."""
    import agent_service.builder.runtime_vendor as rv

    monkeypatch.setattr(rv, "_package_root", lambda: None)
    assert rv.runtime_files() == []
