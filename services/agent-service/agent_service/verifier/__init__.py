"""Unified verification + self-repair primitives (M7).

Exposes a normalized failure taxonomy (`classify_failure`) and a pure repair-loop
policy (`RepairLoopController`) shared by the build pipeline and the controlled
agent loop. Keeping these pure and dependency-free makes the verify → classify →
repair → reverify contract deterministically testable.
"""

from __future__ import annotations

from agent_service.verifier.classify import (
    FailureCategory,
    classify_failure,
    failure_fingerprint,
)
from agent_service.verifier.repair import RepairDecision, RepairLoopController

__all__ = [
    "FailureCategory",
    "RepairDecision",
    "RepairLoopController",
    "classify_failure",
    "failure_fingerprint",
]
