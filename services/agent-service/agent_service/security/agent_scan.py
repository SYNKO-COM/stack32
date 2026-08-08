"""Static security scan for generated agent projects (M-I).

Runs before a version can be activated. This is a real (conservative) static
analyzer over the snapshot's source files — not a stub. It flags dangerous code
constructs and likely secret leakage. Findings at `high` severity block
activation; `medium`/`low` are advisory.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

# (regex, code, severity, message). Regexes run per line on .py files.
_CODE_RULES: list[tuple[re.Pattern[str], str, str, str]] = [
    (re.compile(r"\bos\.system\s*\("), "OS_SYSTEM", "high", "os.system() shell execution"),
    (re.compile(r"\bsubprocess\.\w+\([^)]*shell\s*=\s*True"), "SHELL_TRUE", "high", "subprocess with shell=True"),
    (re.compile(r"(?<![\w.])eval\s*\("), "EVAL", "high", "use of eval()"),
    (re.compile(r"(?<![\w.])exec\s*\("), "EXEC", "high", "use of exec()"),
    (re.compile(r"\b__import__\s*\("), "DYNAMIC_IMPORT", "medium", "dynamic __import__()"),
    (re.compile(r"\bpickle\.loads?\s*\("), "PICKLE", "medium", "pickle deserialization"),
    (re.compile(r"\bverify\s*=\s*False"), "TLS_VERIFY_OFF", "high", "TLS verification disabled"),
    (re.compile(r"\brequests\.\w+\(|\bhttpx\.\w+\(|\burllib"), "RAW_NETWORK", "low", "raw network call (prefer bound tools)"),
]

# Likely hard-coded secrets.
_SECRET_RULES: list[tuple[re.Pattern[str], str, str, str]] = [
    (re.compile(r"(?i)(api[_-]?key|secret|token|password)\s*[:=]\s*['\"][A-Za-z0-9_\-]{16,}['\"]"), "HARDCODED_SECRET", "high", "hard-coded secret literal"),
    (re.compile(r"sk-[A-Za-z0-9]{20,}"), "OPENAI_KEY", "high", "OpenAI-style API key literal"),
    (re.compile(r"AKIA[0-9A-Z]{16}"), "AWS_KEY", "high", "AWS access key literal"),
]


@dataclass(slots=True)
class Finding:
    code: str
    severity: str
    message: str
    path: str
    line: int


@dataclass(slots=True)
class ScanReport:
    findings: list[Finding] = field(default_factory=list)

    @property
    def passed(self) -> bool:
        return not any(f.severity == "high" for f in self.findings)

    @property
    def high(self) -> int:
        return sum(1 for f in self.findings if f.severity == "high")

    def to_dict(self) -> dict[str, Any]:
        return {
            "passed": self.passed,
            "high": self.high,
            "total": len(self.findings),
            "findings": [
                {"code": f.code, "severity": f.severity, "message": f.message, "path": f.path, "line": f.line}
                for f in self.findings
            ],
        }


def scan_project_files(files: list[dict[str, Any]]) -> ScanReport:
    """Scan snapshot files ([{path, content, ...}]) for dangerous constructs."""
    report = ScanReport()
    for f in files:
        path = str(f.get("path", ""))
        content = f.get("content")
        if not isinstance(content, str):
            continue
        is_python = path.endswith(".py")
        for lineno, line in enumerate(content.splitlines(), start=1):
            if is_python:
                for pattern, code, severity, message in _CODE_RULES:
                    if pattern.search(line):
                        report.findings.append(Finding(code, severity, message, path, lineno))
            for pattern, code, severity, message in _SECRET_RULES:
                if pattern.search(line):
                    report.findings.append(Finding(code, severity, message, path, lineno))
    return report
