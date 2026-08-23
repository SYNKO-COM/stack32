"""Detect a coding agent that weakened its own quality gates instead of fixing code.

The repair loop stops when pytest and ruff both pass. That is only a meaningful
signal if the agent cannot change what "pass" means. Left unguarded, the
cheapest way out of a failing build is not to fix the bug:

- add ``ignore = ["F", "E"]`` to the generated ``pyproject.toml``
- delete the test that fails
- decorate it with ``@pytest.mark.skip`` or ``xfail``
- break collection so fewer tests run

Each one turns the gate green while the agent has repaired nothing, and the
user receives a "ready" agent that does not work. Snapshot the policy before
repair, compare after, and treat any weakening as a failed repair.
"""

from __future__ import annotations

import ast
import re
from dataclasses import dataclass, field

_RUFF_SELECT_RE = re.compile(r"^\s*select\s*=\s*\[(.*?)\]", re.M | re.S)
_RUFF_IGNORE_RE = re.compile(r"^\s*ignore\s*=\s*\[(.*?)\]", re.M | re.S)
_SKIP_MARKERS = ("pytest.mark.skip", "pytest.mark.xfail", "unittest.skip")

POLICY_FILE = "pyproject.toml"


def _rule_set(pattern: re.Pattern[str], text: str) -> set[str]:
    match = pattern.search(text or "")
    if not match:
        return set()
    return {token.strip().strip("\"'") for token in match.group(1).split(",") if token.strip()}


def _is_test_path(path: str) -> bool:
    name = path.rsplit("/", 1)[-1]
    return path.startswith("tests/") or name.startswith("test_") or name.endswith("_test.py")


def _count_tests(source: str) -> int:
    """Number of test functions, ignoring syntax errors (the build catches those)."""
    try:
        tree = ast.parse(source)
    except SyntaxError:
        return -1
    return sum(
        1
        for node in ast.walk(tree)
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
        and node.name.startswith("test_")
    )


def _count_skips(source: str) -> int:
    return sum(source.count(marker) for marker in _SKIP_MARKERS)


@dataclass(frozen=True)
class GateSnapshot:
    ruff_select: frozenset[str] = frozenset()
    ruff_ignore: frozenset[str] = frozenset()
    tests_by_path: dict[str, int] = field(default_factory=dict)
    skips_by_path: dict[str, int] = field(default_factory=dict)


def snapshot_gates(files: list[dict]) -> GateSnapshot:
    """Capture the quality policy from a project file listing."""
    select: set[str] = set()
    ignore: set[str] = set()
    tests: dict[str, int] = {}
    skips: dict[str, int] = {}
    for entry in files or []:
        path = str(entry.get("path") or "")
        content = str(entry.get("content") or "")
        if path == POLICY_FILE:
            select = _rule_set(_RUFF_SELECT_RE, content)
            ignore = _rule_set(_RUFF_IGNORE_RE, content)
        elif _is_test_path(path) and path.endswith(".py"):
            tests[path] = _count_tests(content)
            skips[path] = _count_skips(content)
    return GateSnapshot(
        ruff_select=frozenset(select),
        ruff_ignore=frozenset(ignore),
        tests_by_path=tests,
        skips_by_path=skips,
    )


def detect_weakened_gates(before: GateSnapshot, after: GateSnapshot) -> list[str]:
    """Return human-readable reasons the gate was weakened. Empty means clean."""
    reasons: list[str] = []

    dropped_rules = before.ruff_select - after.ruff_select
    if dropped_rules:
        reasons.append(f"ruff select lost {sorted(dropped_rules)}")
    added_ignores = after.ruff_ignore - before.ruff_ignore
    if added_ignores:
        reasons.append(f"ruff ignore gained {sorted(added_ignores)}")

    for path, count in before.tests_by_path.items():
        if path not in after.tests_by_path:
            reasons.append(f"test file deleted: {path}")
            continue
        now = after.tests_by_path[path]
        if count >= 0 and now >= 0 and now < count:
            reasons.append(f"tests removed from {path}: {count} -> {now}")

    for path, count in after.skips_by_path.items():
        if count > before.skips_by_path.get(path, 0):
            reasons.append(f"skip/xfail markers added in {path}")

    return reasons
