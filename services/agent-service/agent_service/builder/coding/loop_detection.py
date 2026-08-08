"""Loop / stagnation detection (M-C, playbook §23).

Fingerprints tool calls (name + normalized args) and detects: repeated
identical calls, and identical failures without any file change. The
orchestrator uses this to force a replan or terminate — independent of
max_turns.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field


def fingerprint(tool_name: str, arguments: dict) -> str:
    try:
        norm = json.dumps(arguments, sort_keys=True, default=str)
    except (TypeError, ValueError):
        norm = str(arguments)
    return hashlib.sha256(f"{tool_name}:{norm}".encode()).hexdigest()[:16]


@dataclass
class LoopDetector:
    max_identical: int = 3
    _counts: dict[str, int] = field(default_factory=dict)
    _last_failure_sig: str | None = None
    _identical_failures: int = 0

    def observe_call(self, tool_name: str, arguments: dict) -> None:
        fp = fingerprint(tool_name, arguments)
        self._counts[fp] = self._counts.get(fp, 0) + 1

    def repeated_call(self, tool_name: str, arguments: dict) -> bool:
        fp = fingerprint(tool_name, arguments)
        return self._counts.get(fp, 0) >= self.max_identical

    def observe_failure(self, signature: str, *, files_changed: bool) -> None:
        if signature == self._last_failure_sig and not files_changed:
            self._identical_failures += 1
        else:
            self._identical_failures = 0
        self._last_failure_sig = signature

    @property
    def stagnating(self) -> bool:
        return self._identical_failures >= 2

    def reason(self) -> str | None:
        if self.stagnating:
            return "LOOP_DETECTED_IDENTICAL_FAILURE"
        if any(count >= self.max_identical for count in self._counts.values()):
            return "LOOP_DETECTED_REPEATED_CALL"
        return None
