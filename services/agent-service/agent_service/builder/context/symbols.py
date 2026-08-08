"""Symbol extraction + reference graph (M-B).

Deterministic AST-backed code intelligence for Python. Extracts classes,
functions and methods (definitions), module imports, and finds references by
name. Never asks a model to infer references when the AST is available.
"""

from __future__ import annotations

import ast
from dataclasses import dataclass, field


@dataclass(slots=True)
class Symbol:
    name: str
    kind: str  # "function" | "class" | "method"
    path: str
    start_line: int
    end_line: int
    parent: str | None = None


@dataclass(slots=True)
class FileImports:
    path: str
    modules: list[str] = field(default_factory=list)


def extract_symbols(path: str, content: str) -> list[Symbol]:
    """Return top-level and nested class/function symbols for a Python file."""
    if not path.endswith(".py"):
        return []
    try:
        tree = ast.parse(content)
    except SyntaxError:
        return []
    symbols: list[Symbol] = []

    def visit(node: ast.AST, parent: str | None) -> None:
        for child in ast.iter_child_nodes(node):
            if isinstance(child, ast.ClassDef):
                symbols.append(
                    Symbol(
                        name=child.name,
                        kind="class",
                        path=path,
                        start_line=child.lineno,
                        end_line=getattr(child, "end_lineno", child.lineno) or child.lineno,
                        parent=parent,
                    )
                )
                visit(child, child.name)
            elif isinstance(child, ast.FunctionDef | ast.AsyncFunctionDef):
                symbols.append(
                    Symbol(
                        name=child.name,
                        kind="method" if parent else "function",
                        path=path,
                        start_line=child.lineno,
                        end_line=getattr(child, "end_lineno", child.lineno) or child.lineno,
                        parent=parent,
                    )
                )

    visit(tree, None)
    return symbols


def extract_imports(path: str, content: str) -> FileImports:
    if not path.endswith(".py"):
        return FileImports(path=path)
    try:
        tree = ast.parse(content)
    except SyntaxError:
        return FileImports(path=path)
    modules: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            modules.extend(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            modules.append(node.module)
    return FileImports(path=path, modules=sorted(set(modules)))


def find_references(name: str, files: dict[str, str]) -> list[tuple[str, int]]:
    """Return (path, line) references to `name` across Python files via AST."""
    hits: list[tuple[str, int]] = []
    for path, content in files.items():
        if not path.endswith(".py"):
            continue
        try:
            tree = ast.parse(content)
        except SyntaxError:
            continue
        for node in ast.walk(tree):
            if isinstance(node, ast.Name) and node.id == name:
                hits.append((path, node.lineno))
            elif isinstance(node, ast.Attribute) and node.attr == name:
                hits.append((path, node.lineno))
    return hits
