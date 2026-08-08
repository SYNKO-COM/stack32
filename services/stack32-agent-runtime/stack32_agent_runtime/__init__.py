"""stack32-agent-runtime: shared runtime SDK for Stack32-generated agents.

Provides a deterministic orchestrator, tool dispatcher, typed state, context
assembly, optional memory, security policy, budgets, checkpoints and tracing.
The runtime is provider-neutral: model access is injected via `ModelAdapter`.
"""

from stack32_agent_runtime.budgets import BudgetExceeded, RuntimeLimits
from stack32_agent_runtime.checkpoints import Checkpointer, InMemoryCheckpointer
from stack32_agent_runtime.context import build_messages, estimate_tokens
from stack32_agent_runtime.memory import InMemorySemanticMemory, SemanticMemory
from stack32_agent_runtime.model import ModelAdapter, ModelResponse
from stack32_agent_runtime.orchestrator import Orchestrator, OrchestratorConfig
from stack32_agent_runtime.patterns import (
    AgentNeeds,
    Pattern,
    recommended_limits,
    select_pattern,
)
from stack32_agent_runtime.security import PolicyViolation, SecurityPolicy
from stack32_agent_runtime.state import AgentState, Message, Observation, ToolCallRecord
from stack32_agent_runtime.tools import ToolRegistry, ToolSpec
from stack32_agent_runtime.tracing import Tracer

__version__ = "0.1.0"

__all__ = [
    "__version__",
    "Orchestrator",
    "OrchestratorConfig",
    "ToolRegistry",
    "ToolSpec",
    "AgentState",
    "Message",
    "Observation",
    "ToolCallRecord",
    "ModelAdapter",
    "ModelResponse",
    "SecurityPolicy",
    "PolicyViolation",
    "RuntimeLimits",
    "BudgetExceeded",
    "Checkpointer",
    "InMemoryCheckpointer",
    "SemanticMemory",
    "InMemorySemanticMemory",
    "Tracer",
    "build_messages",
    "estimate_tokens",
    "AgentNeeds",
    "Pattern",
    "select_pattern",
    "recommended_limits",
]
