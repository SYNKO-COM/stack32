"""Builder coding tool registry (M-C).

Namespaced, typed coding tools the Stack32 Builder exposes to the LLM via
provider-native structured tool calling. Every tool operates strictly through
the SandboxProvider (path-confined) and the ContextEngine. The orchestrator —
not the model — validates and executes each call.

Namespaces: workspace.* / code.* / exec.* / git.* / stack32.*
"""

from __future__ import annotations

import shlex
from collections.abc import Awaitable, Callable
from dataclasses import asdict, dataclass, field
from typing import Any

from agent_service.builder.context.diagnostics import (
    parse_pytest_output,
    parse_ruff_output,
    summarize,
    syntax_diagnostics,
)
from agent_service.builder.context.engine import ContextEngine
from agent_service.sandbox.base import (
    SandboxError,
    SandboxProvider,
    WorkspaceHandle,
)


@dataclass
class ToolContext:
    provider: SandboxProvider
    handle: WorkspaceHandle
    engine: ContextEngine
    files_touched: set[str] = field(default_factory=set)


@dataclass(slots=True)
class CodingTool:
    id: str
    namespace: str
    description: str
    input_schema: dict[str, Any]
    risk: str  # "low" | "medium" | "high"
    run: Callable[[ToolContext, dict[str, Any]], Awaitable[dict[str, Any]]]

    def openai_schema(self) -> dict[str, Any]:
        return {
            "type": "function",
            "function": {
                "name": self.id,
                "description": self.description,
                "parameters": self.input_schema,
            },
        }


class CodingToolRegistry:
    def __init__(self) -> None:
        self._tools: dict[str, CodingTool] = {}

    def register(self, tool: CodingTool) -> None:
        self._tools[tool.id] = tool

    def get(self, tool_id: str) -> CodingTool | None:
        return self._tools.get(tool_id)

    def ids(self) -> list[str]:
        return sorted(self._tools)

    def schemas_for(self, ids: list[str]) -> list[dict[str, Any]]:
        return [self._tools[i].openai_schema() for i in ids if i in self._tools]

    def all_schemas(self) -> list[dict[str, Any]]:
        return [t.openai_schema() for t in self._tools.values()]


def _obj(props: dict[str, Any], required: list[str]) -> dict[str, Any]:
    return {"type": "object", "properties": props, "required": required}


# --- tool implementations -------------------------------------------------


async def _read_file(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    path = str(args["path"])
    content = await ctx.provider.read_file(ctx.handle, path)
    start = args.get("start_line")
    end = args.get("end_line")
    if start or end:
        lines = content.splitlines()
        s = max(0, int(start or 1) - 1)
        e = int(end or len(lines))
        content = "\n".join(lines[s:e])
    return {"path": path, "content": content[:20_000]}


async def _list_directory(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    path = str(args.get("path", "."))
    depth = int(args.get("depth", 2))
    entries = await ctx.provider.list_files(ctx.handle, path, depth=depth)
    return {
        "path": path,
        "entries": [{"path": e.path, "is_dir": e.is_dir, "size": e.size_bytes} for e in entries[:400]],
    }


async def _grep(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    pattern = str(args["query"])
    glob = args.get("glob")
    matches = ctx.engine.grep(pattern, glob=glob, limit=80)
    return {"matches": [{"path": m.path, "line": m.line, "text": m.text} for m in matches]}


async def _file_tree(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    entries = await ctx.provider.list_files(ctx.handle, ".", depth=int(args.get("depth", 4)))
    tree = sorted({e.path for e in entries})
    return {"tree": tree[:400]}


async def _create_file(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    path = str(args["path"])
    content = str(args["content"])
    await ctx.provider.write_file(ctx.handle, path, content)
    await ctx.engine.on_file_written(path, content)
    ctx.files_touched.add(path)
    diags = syntax_diagnostics(path, content)
    return {"path": path, "bytes": len(content.encode()), "diagnostics": summarize(diags)}


async def _apply_patch(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    """Exact string replacement edit — the primary editing mechanism.

    Reliable for LLM edits: {path, old_string, new_string}. old_string must
    match exactly once; otherwise the edit is rejected (no ambiguous writes).
    """
    path = str(args["path"])
    old = str(args["old_string"])
    new = str(args["new_string"])
    current = await ctx.provider.read_file(ctx.handle, path)
    count = current.count(old)
    if count == 0:
        return {"ok": False, "error": "old_string not found", "path": path}
    if count > 1:
        return {"ok": False, "error": f"old_string is ambiguous ({count} matches)", "path": path}
    updated = current.replace(old, new, 1)
    await ctx.provider.write_file(ctx.handle, path, updated)
    await ctx.engine.on_file_written(path, updated)
    ctx.files_touched.add(path)
    diags = syntax_diagnostics(path, updated)
    return {"ok": True, "path": path, "diagnostics": summarize(diags)}


async def _delete_file(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    path = str(args["path"])
    await ctx.provider.delete_file(ctx.handle, path)
    ctx.files_touched.add(path)
    return {"ok": True, "path": path}


async def _find_symbol(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    name = str(args["name"])
    syms = ctx.engine.find_symbol(name)
    return {
        "symbols": [
            {"name": s.name, "kind": s.kind, "path": s.path, "line": s.start_line} for s in syms
        ]
    }


async def _get_diagnostics(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    path = str(args["path"])
    content = await ctx.provider.read_file(ctx.handle, path)
    diags = syntax_diagnostics(path, content)
    return {"path": path, "diagnostics": summarize(diags), "count": len(diags)}


async def _search_tool_catalog(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    from agent_service.builder.catalog import search_tool_catalog

    results = await search_tool_catalog(str(args["query"]), limit=int(args.get("limit", 6)))
    return {"tools": results}


async def _get_tool_schema(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    from agent_service.builder.catalog import get_tool_schema

    version = args.get("version")
    schema = await get_tool_schema(str(args["tool_id"]), version=int(version) if version else None)
    if schema is None:
        return {"error": "TOOL_NOT_IN_CATALOG", "tool_id": args.get("tool_id")}
    return schema


def _wrap_exec(default_cmd: list[str] | None = None):
    async def _run(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
        if default_cmd is not None:
            command = default_cmd + list(args.get("extra_args", []))
        else:
            raw = args["command"]
            command = raw if isinstance(raw, list) else shlex.split(str(raw))
        cwd = str(args.get("cwd", "."))
        timeout = args.get("timeout_seconds")
        try:
            result = await ctx.provider.run_command(
                ctx.handle, command, cwd=cwd, timeout_seconds=timeout
            )
        except SandboxError as exc:
            return {"ok": False, "error": str(exc), "code": getattr(exc, "code", "SANDBOX_ERROR")}
        payload = {
            "ok": result.ok,
            "exit_code": result.exit_code,
            "stdout": result.stdout[-8000:],
            "stderr": result.stderr[-8000:],
            "duration_ms": result.duration_ms,
        }
        # Attach parsed diagnostics for verification tools.
        if default_cmd and "pytest" in default_cmd:
            payload["diagnostics"] = [asdict(d) for d in parse_pytest_output(result.stdout, result.stderr)]
        if default_cmd and "ruff" in " ".join(default_cmd):
            payload["diagnostics"] = [asdict(d) for d in parse_ruff_output(result.stdout)]
        return payload

    return _run


async def _workspace_status(ctx: ToolContext, _args: dict[str, Any]) -> dict[str, Any]:
    touched = sorted(ctx.files_touched)
    return {"files_touched": touched, "count": len(touched)}


async def _workspace_diff(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    import difflib

    path = str(args.get("path") or "").strip()
    if not path:
        return {"error": "path required"}
    try:
        current = await ctx.provider.read_file(ctx.handle, path)
    except Exception as exc:  # noqa: BLE001
        return {"error": str(exc)[:300]}
    original = str(args.get("original_content") or "")
    if not original:
        return {"path": path, "note": "Provide original_content to compute diff.", "lines": len(current.splitlines())}
    diff = list(
        difflib.unified_diff(
            original.splitlines(),
            current.splitlines(),
            fromfile=f"a/{path}",
            tofile=f"b/{path}",
            lineterm="",
        )
    )
    return {"path": path, "diff": "\n".join(diff)[:12000], "changed": bool(diff)}


async def _run_targeted_test(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    nodeid = str(args.get("nodeid") or args.get("test") or "").strip()
    extra = ["-q", nodeid] if nodeid else ["-q"]
    runner = _wrap_exec(["python", "-m", "pytest", *extra])
    return await runner(ctx, {"cwd": args.get("cwd", ".")})


def build_registry() -> CodingToolRegistry:
    reg = CodingToolRegistry()
    tools = [
        CodingTool(
            "workspace.read_file", "workspace", "Read a file (optionally a line range).",
            _obj({"path": {"type": "string"}, "start_line": {"type": "integer"}, "end_line": {"type": "integer"}}, ["path"]),
            "low", _read_file,
        ),
        CodingTool(
            "workspace.list_directory", "workspace", "List files/dirs under a path.",
            _obj({"path": {"type": "string"}, "depth": {"type": "integer"}}, []),
            "low", _list_directory,
        ),
        CodingTool(
            "workspace.grep", "workspace", "Regex search across the project.",
            _obj({"query": {"type": "string"}, "glob": {"type": "string"}}, ["query"]),
            "low", _grep,
        ),
        CodingTool(
            "workspace.file_tree", "workspace", "Compact project file tree.",
            _obj({"depth": {"type": "integer"}}, []),
            "low", _file_tree,
        ),
        CodingTool(
            "workspace.create_file", "workspace", "Create or overwrite a file with full content.",
            _obj({"path": {"type": "string"}, "content": {"type": "string"}}, ["path", "content"]),
            "medium", _create_file,
        ),
        CodingTool(
            "workspace.apply_patch", "workspace",
            "Edit a file by exact string replacement. old_string must match exactly once.",
            _obj({"path": {"type": "string"}, "old_string": {"type": "string"}, "new_string": {"type": "string"}}, ["path", "old_string", "new_string"]),
            "medium", _apply_patch,
        ),
        CodingTool(
            "workspace.delete_file", "workspace", "Delete a file.",
            _obj({"path": {"type": "string"}}, ["path"]),
            "medium", _delete_file,
        ),
        CodingTool(
            "code.find_symbol", "code", "Find a class/function/method definition by name.",
            _obj({"name": {"type": "string"}}, ["name"]),
            "low", _find_symbol,
        ),
        CodingTool(
            "code.get_diagnostics", "code", "Get syntax diagnostics for a file.",
            _obj({"path": {"type": "string"}}, ["path"]),
            "low", _get_diagnostics,
        ),
        CodingTool(
            "exec.run_command", "exec", "Run a command (argv array) in the sandbox.",
            _obj({"command": {"type": "array", "items": {"type": "string"}}, "cwd": {"type": "string"}, "timeout_seconds": {"type": "integer"}}, ["command"]),
            "high", _wrap_exec(),
        ),
        CodingTool(
            "exec.run_tests", "exec", "Run pytest in the project.",
            _obj({"extra_args": {"type": "array", "items": {"type": "string"}}, "cwd": {"type": "string"}}, []),
            "medium", _wrap_exec(["python", "-m", "pytest", "-q"]),
        ),
        CodingTool(
            "exec.run_lint", "exec", "Run ruff lint in the project.",
            _obj({"extra_args": {"type": "array", "items": {"type": "string"}}, "cwd": {"type": "string"}}, []),
            "low", _wrap_exec(["python", "-m", "ruff", "check", "."]),
        ),
        CodingTool(
            "exec.run_targeted_test", "exec", "Run a single pytest node id or file.",
            _obj({"nodeid": {"type": "string"}, "cwd": {"type": "string"}}, []),
            "medium", _run_targeted_test,
        ),
        CodingTool(
            "workspace.status", "workspace", "List files touched in this repair session.",
            _obj({}, []),
            "low", _workspace_status,
        ),
        CodingTool(
            "workspace.diff", "workspace", "Unified diff for a file vs provided original content.",
            _obj({"path": {"type": "string"}, "original_content": {"type": "string"}}, ["path"]),
            "low", _workspace_diff,
        ),
        CodingTool(
            "stack32.search_tool_catalog", "stack32",
            "Search the Stack32 tool/connector catalog for tools relevant to the agent being built. Returns brief summaries (no schemas).",
            _obj({"query": {"type": "string"}, "limit": {"type": "integer"}}, ["query"]),
            "low", _search_tool_catalog,
        ),
        CodingTool(
            "stack32.get_tool_schema", "stack32",
            "Load the full input schema for a specific catalog tool version (just-in-time).",
            _obj({"tool_id": {"type": "string"}, "version": {"type": "integer"}}, ["tool_id"]),
            "low", _get_tool_schema,
        ),
    ]
    for t in tools:
        reg.register(t)
    from agent_service.config import get_settings

    if get_settings().BUILDER_BROWSER_DEBUG_ENABLED:
        from agent_service.builder.coding.tools_browser import browser_tools

        for bt in browser_tools():
            reg.register(bt)
    return reg
