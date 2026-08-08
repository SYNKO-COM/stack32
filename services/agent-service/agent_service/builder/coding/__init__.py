"""Stack32 Builder coding agent (M-C)."""

from agent_service.builder.coding.agent import CodingAgent, CodingResult, ModelDecision
from agent_service.builder.coding.ledger import PlanStep, WorkLedger
from agent_service.builder.coding.loop_detection import LoopDetector, fingerprint
from agent_service.builder.coding.prompts import (
    BUILDER_SYSTEM_PROMPT,
    BUILDER_SYSTEM_PROMPT_VERSION,
)
from agent_service.builder.coding.tools import (
    CodingTool,
    CodingToolRegistry,
    ToolContext,
    build_registry,
)

__all__ = [
    "CodingAgent",
    "CodingResult",
    "ModelDecision",
    "WorkLedger",
    "PlanStep",
    "LoopDetector",
    "fingerprint",
    "BUILDER_SYSTEM_PROMPT",
    "BUILDER_SYSTEM_PROMPT_VERSION",
    "CodingTool",
    "CodingToolRegistry",
    "ToolContext",
    "build_registry",
]
