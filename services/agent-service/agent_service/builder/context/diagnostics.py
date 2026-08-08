"""Diagnostics collection + parsing (M-B).

Turns raw verification output (Python syntax, pytest, ruff) into a typed list of
`Diagnostic`s that the orchestrator treats as high-priority context. When a
diagnostic points at a file/line, it outranks semantic retrieval.
"""

from __future__ import annotations

import ast
import re
from dataclasses import dataclass


@dataclass(slots=True)
class Diagnostic:
    kind: str  # "syntax" | "test" | "lint" | "type" | "build"
    severity: str  # "error" | "warning"
    path: str | None
    line: int | None
    message: str


def syntax_diagnostics(path: str, content: str) -> list[Diagnostic]:
    if not path.endswith(".py"):
        return []
    try:
        ast.parse(content)
    except SyntaxError as exc:
        return [
            Diagnostic(
                kind="syntax",
                severity="error",
                path=path,
                line=exc.lineno,
                message=(exc.msg or "syntax error")[:300],
            )
        ]
    return []


_PYTEST_FAIL_RE = re.compile(r"^(FAILED|ERROR)\s+([^\s:]+)::?(\S+)?", re.MULTILINE)
_PYTEST_ASSERT_RE = re.compile(r"^(.*?):(\d+):\s*(AssertionError|Error)(.*)$", re.MULTILINE)
_RUFF_RE = re.compile(r"^(.*?):(\d+):(\d+):\s*([A-Z]\d+)\s+(.*)$", re.MULTILINE)


def parse_pytest_output(stdout: str, stderr: str) -> list[Diagnostic]:
    text = f"{stdout}\n{stderr}"
    diags: list[Diagnostic] = []
    for m in _PYTEST_FAIL_RE.finditer(text):
        node = m.group(3) or ""
        diags.append(
            Diagnostic(
                kind="test",
                severity="error",
                path=m.group(2),
                line=None,
                message=f"{m.group(1)} {m.group(2)}::{node}".strip()[:300],
            )
        )
    for m in _PYTEST_ASSERT_RE.finditer(text):
        diags.append(
            Diagnostic(
                kind="test",
                severity="error",
                path=m.group(1),
                line=int(m.group(2)),
                message=f"{m.group(3)}{m.group(4)}".strip()[:300],
            )
        )
    return diags


def parse_ruff_output(stdout: str) -> list[Diagnostic]:
    diags: list[Diagnostic] = []
    for m in _RUFF_RE.finditer(stdout):
        diags.append(
            Diagnostic(
                kind="lint",
                severity="warning",
                path=m.group(1),
                line=int(m.group(2)),
                message=f"{m.group(4)} {m.group(5)}".strip()[:300],
            )
        )
    return diags


def summarize(diagnostics: list[Diagnostic], *, limit: int = 12) -> str:
    if not diagnostics:
        return "No diagnostics."
    lines = []
    for d in diagnostics[:limit]:
        loc = d.path or "?"
        if d.line:
            loc = f"{loc}:{d.line}"
        lines.append(f"[{d.kind}/{d.severity}] {loc} {d.message}")
    if len(diagnostics) > limit:
        lines.append(f"... +{len(diagnostics) - limit} more")
    return "\n".join(lines)
