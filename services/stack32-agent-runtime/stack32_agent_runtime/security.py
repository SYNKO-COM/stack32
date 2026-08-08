"""Runtime security policy for generated agents (playbook §42).

Authorization is enforced OUTSIDE the model: allowed tools, approval policy,
scopes. The model cannot disable approval.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

ApprovalMode = Literal["never", "conditional", "always"]


class PolicyViolation(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


@dataclass
class SecurityPolicy:
    allowed_tools: set[str] = field(default_factory=set)
    approvals: dict[str, ApprovalMode] = field(default_factory=dict)

    def authorize(self, tool_name: str) -> None:
        if self.allowed_tools and tool_name not in self.allowed_tools:
            raise PolicyViolation("TOOL_NOT_ALLOWED", f"Tool not bound: {tool_name}")

    def requires_approval(self, tool_name: str, *, side_effect: bool, risk: str) -> bool:
        mode = self.approvals.get(tool_name)
        if mode == "always":
            return True
        if mode == "never":
            return False
        # conditional / unset: default deny for high-risk side effects.
        if mode == "conditional":
            return side_effect
        return side_effect and risk == "high"
