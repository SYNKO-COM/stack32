"""Repo-wide guard against function-local imports shadowing module-level names.

Production incident this prevents: ``publishing/service.py`` imported
``get_supabase_admin_client`` at module level (line 13) and re-imported it
inside ``publish()`` near the end of the function. Python then treats the name
as local for the *whole* function, so an earlier use raised
``UnboundLocalError`` and every single agent publication returned HTTP 500.

Ruff flags this as F823, but a failing lint job is easy to ignore; a failing
test is not.
"""

from __future__ import annotations

import ast
import pathlib

import pytest

PACKAGE_ROOT = pathlib.Path(__file__).resolve().parents[1] / "agent_service"


def _module_level_imported_names(tree: ast.Module) -> set[str]:
    names: set[str] = set()
    for node in tree.body:  # module scope only
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            for alias in node.names:
                names.add(alias.asname or alias.name.split(".")[0])
    return names


def _local_imports(func: ast.AST) -> set[str]:
    names: set[str] = set()
    for node in ast.walk(func):
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            for alias in node.names:
                names.add(alias.asname or alias.name.split(".")[0])
    return names


def _iter_python_files() -> list[pathlib.Path]:
    return sorted(p for p in PACKAGE_ROOT.rglob("*.py") if "__pycache__" not in p.parts)


@pytest.mark.parametrize("path", _iter_python_files(), ids=lambda p: p.name)
def test_no_local_import_shadows_module_import(path: pathlib.Path):
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    module_names = _module_level_imported_names(tree)
    if not module_names:
        return

    offenders: list[str] = []
    for node in ast.walk(tree):
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        clash = _local_imports(node) & module_names
        if clash:
            offenders.append(f"{node.name}() re-imports {sorted(clash)}")

    assert not offenders, (
        f"{path.relative_to(PACKAGE_ROOT.parent)}: function-local import shadows a "
        f"module-level import, which makes the name local for the entire function "
        f"and raises UnboundLocalError on any earlier use -> {offenders}"
    )
