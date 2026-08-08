"""M-B: context engine (indexer/symbols/retriever/diagnostics/compaction/budget)."""

from __future__ import annotations

from agent_service.builder.context import (
    ContextEngine,
    allocate,
    chunk_file,
    compact_history,
    estimate_tokens,
    extract_imports,
    extract_symbols,
    find_references,
    parse_pytest_output,
    parse_ruff_output,
    syntax_diagnostics,
)
from agent_service.sandbox.base import SandboxConfig
from agent_service.sandbox.local import LocalSandbox

SAMPLE = '''\
import os
from collections import defaultdict


class Orchestrator:
    def run(self, task):
        return task


def helper(x):
    return x + 1
'''


def test_extract_symbols_python():
    syms = extract_symbols("src/agent/orchestrator.py", SAMPLE)
    names = {(s.name, s.kind) for s in syms}
    assert ("Orchestrator", "class") in names
    assert ("run", "method") in names
    assert ("helper", "function") in names


def test_extract_imports():
    imports = extract_imports("m.py", SAMPLE)
    assert "os" in imports.modules
    assert "collections" in imports.modules


def test_find_references():
    files = {"a.py": "x = helper(3)\n", "b.py": "y = 1\n"}
    hits = find_references("helper", files)
    assert any(p == "a.py" for p, _ in hits)


def test_chunk_python_by_symbol():
    chunks = chunk_file("o.py", SAMPLE)
    kinds = {c.kind for c in chunks}
    assert "class" in kinds or "function" in kinds


def test_syntax_diagnostics():
    diags = syntax_diagnostics("bad.py", "def f(:\n")
    assert diags and diags[0].kind == "syntax"
    assert syntax_diagnostics("ok.py", "x = 1\n") == []


def test_parse_pytest_output():
    out = "FAILED tests/test_x.py::test_foo - assert 1 == 2\n"
    diags = parse_pytest_output(out, "")
    assert any(d.kind == "test" for d in diags)


def test_parse_ruff_output():
    out = "src/a.py:3:1: F401 imported but unused\n"
    diags = parse_ruff_output(out)
    assert diags and diags[0].kind == "lint"


def test_budget_allocation():
    alloc = allocate(100_000, 8_000)
    assert alloc.total_tokens == 92_000
    assert alloc.per_category_tokens["code"] > alloc.per_category_tokens["reserve"]
    assert estimate_tokens("abcd" * 10) >= 10


async def test_compaction_keeps_invariants():
    msgs = [{"role": "system", "content": "rules"}]
    msgs += [{"role": "user", "content": "x" * 4000} for _ in range(20)]
    result = await compact_history(msgs, max_tokens=500, keep_recent=4)
    assert result.compacted
    assert result.messages[0]["role"] == "system"
    assert result.kept_count < result.original_count


async def test_index_and_retrieve():
    provider = LocalSandbox()
    handle = await provider.create_workspace(SandboxConfig())
    try:
        await provider.write_file(handle, "src/agent/orchestrator.py", SAMPLE)
        await provider.write_file(handle, "README.md", "# hello\n")
        engine = ContextEngine(provider, handle, gateway=None)
        index = await engine.build()
        assert index.file_count >= 2
        assert engine.find_symbol("Orchestrator")
        hits = engine.grep("helper")
        assert any(h.path.endswith("orchestrator.py") for h in hits)
        result = await engine.retrieve("fix the Orchestrator run method")
        assert result.chunks or result.definitions
    finally:
        await provider.destroy_workspace(handle)


async def test_incremental_update():
    provider = LocalSandbox()
    handle = await provider.create_workspace(SandboxConfig())
    try:
        await provider.write_file(handle, "m.py", "def a():\n    return 1\n")
        engine = ContextEngine(provider, handle)
        await engine.build()
        assert engine.find_symbol("a")
        new_src = "def b():\n    return 2\n"
        await provider.write_file(handle, "m.py", new_src)
        await engine.on_file_written("m.py", new_src)
        assert engine.find_symbol("b")
        assert not engine.find_symbol("a")
    finally:
        await provider.destroy_workspace(handle)
