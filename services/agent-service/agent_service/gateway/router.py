"""Deterministic model router — the LLM never chooses the provider."""

from __future__ import annotations

from enum import StrEnum

from agent_service.gateway.model_gateway import ModelProfile


class TaskType(StrEnum):
    INTENT_CLASSIFICATION = "intent_classification"
    IDENTITY = "identity"
    SIMPLE_PATCH = "simple_patch"
    ARCHITECTURE = "architecture"
    INSTRUCTIONS = "instructions"
    GRAPH_GENERATION = "graph_generation"
    VALIDATION_FEEDBACK = "validation_feedback"
    REPAIR = "repair"
    LIVE_SIMPLE = "live_simple"
    LIVE_TOOL_USE = "live_tool_use"
    EMBEDDINGS = "embeddings"


class TaskComplexity(StrEnum):
    FAST = "fast"
    STANDARD = "standard"
    HEAVY = "heavy"


_ROUTE: dict[TaskType, ModelProfile] = {
    TaskType.INTENT_CLASSIFICATION: ModelProfile.FAST,
    TaskType.IDENTITY: ModelProfile.FAST,
    TaskType.SIMPLE_PATCH: ModelProfile.FAST,
    TaskType.ARCHITECTURE: ModelProfile.CODING,
    TaskType.INSTRUCTIONS: ModelProfile.CODING,
    TaskType.GRAPH_GENERATION: ModelProfile.CODING,
    TaskType.VALIDATION_FEEDBACK: ModelProfile.VALIDATOR,
    TaskType.REPAIR: ModelProfile.CODING,
    TaskType.LIVE_SIMPLE: ModelProfile.BALANCED,
    TaskType.LIVE_TOOL_USE: ModelProfile.REASONING,
    TaskType.EMBEDDINGS: ModelProfile.EMBEDDING,
}


def route_profile(
    task: TaskType,
    *,
    complexity: TaskComplexity = TaskComplexity.STANDARD,
    budget_remaining_usd: float | None = None,
) -> ModelProfile:
    """Select a model profile for a task.

    When budget is nearly exhausted, prefer FAST/BALANCED over REASONING/CODING.
    """
    profile = _ROUTE[task]
    if budget_remaining_usd is not None and budget_remaining_usd < 1.0:
        if profile in (ModelProfile.REASONING, ModelProfile.CODING):
            return ModelProfile.BALANCED
    if complexity == TaskComplexity.FAST and profile in (
        ModelProfile.REASONING,
        ModelProfile.CODING,
    ):
        return ModelProfile.BALANCED
    return profile


def detect_complexity(prompt: str, *, is_first_build: bool, tool_count: int = 0) -> TaskComplexity:
    text = prompt.lower()
    simple_markers = ("rename", "change tone", "add rule", "starter prompt", "output format")
    if any(m in text for m in simple_markers) and not is_first_build:
        return TaskComplexity.FAST
    heavy_markers = ("branch", "sub-agent", "workflow", "if then", "multi-step", "several tools")
    if is_first_build or tool_count >= 3 or any(m in text for m in heavy_markers):
        return TaskComplexity.HEAVY
    return TaskComplexity.STANDARD
