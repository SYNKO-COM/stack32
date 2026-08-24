"""Stage-aware platform model routing (OpenAI-first, Anthropic expert escalation).

Platform-internal Builder routing only — user BYOK paths are unchanged.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum

from agent_service.config import get_settings
from agent_service.gateway.model_gateway import ModelProfile


class CodingStage(StrEnum):
    ARCHITECTURE = "architecture"
    INSPECT = "inspect"
    DIAGNOSE = "diagnose"
    PATCH = "patch"
    REPAIR_NORMAL = "repair_normal"
    REPAIR_HARD = "repair_hard"
    REPAIR_EXPERT = "repair_expert"
    VALIDATE = "validate"


class ReasoningEffort(StrEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    XHIGH = "xhigh"


@dataclass(frozen=True)
class StageRoute:
    model: str
    profile: ModelProfile
    reasoning_effort: ReasoningEffort | None = None
    timeout_seconds: int = 90
    escalation_tier: int = 0  # 0=normal, 1=expert, 2=external expert


def _settings():
    return get_settings()


def platform_model_chain(profile: ModelProfile, *, stage: CodingStage | None = None) -> list[str]:
    """Ordered model ids for a platform profile — no xAI, no BALANCED downgrade."""
    s = _settings()
    if profile == ModelProfile.FAST:
        return _dedupe([s.MODEL_FAST_PRIMARY, s.MODEL_FAST_FALLBACK])
    if profile == ModelProfile.BALANCED:
        return _dedupe([s.MODEL_BALANCED_PRIMARY, s.MODEL_BALANCED_FALLBACK])
    if profile == ModelProfile.REASONING:
        return _dedupe([
            s.MODEL_REASONING_PRIMARY,
            s.MODEL_REASONING_EXPERT,
            s.MODEL_REASONING_FALLBACK,
        ])
    if profile == ModelProfile.VALIDATOR:
        return _dedupe([s.MODEL_VALIDATOR_PRIMARY, s.MODEL_VALIDATOR_FALLBACK])
    if profile == ModelProfile.CODING:
        if stage == CodingStage.REPAIR_EXPERT:
            return _dedupe([
                s.MODEL_CODING_EXTERNAL_EXPERT,
                s.MODEL_CODING_EXPERT,
                s.MODEL_CODING_PRIMARY,
            ])
        if stage in {CodingStage.ARCHITECTURE, CodingStage.REPAIR_HARD}:
            return _dedupe([
                s.MODEL_CODING_EXPERT,
                s.MODEL_CODING_PRIMARY,
                s.MODEL_CODING_FALLBACK,
            ])
        return _dedupe([
            s.MODEL_CODING_PRIMARY,
            s.MODEL_CODING_FALLBACK,
            s.MODEL_CODING_EXPERT,
        ])
    if profile == ModelProfile.EMBEDDING:
        return _dedupe([s.MODEL_EMBEDDING_PRIMARY])
    return []


def route_coding_stage(
    stage: CodingStage,
    *,
    repair_attempt: int = 0,
    prior_failures: int = 0,
) -> StageRoute:
    """Pick model + reasoning for a coding pipeline stage."""
    s = _settings()
    # Climb the OpenAI ladder before leaving it. Reaching for the external
    # expert on the second failure sent 412 LiteLLM calls to Claude Sonnet in a
    # day — 80% of the bill — often on a verification that had never run, so no
    # model could have fixed it. terra tries twice, sol takes over with the
    # heaviest reasoning it has, and only a fourth failure is worth another
    # vendor.
    hard_failure = prior_failures >= 2 and repair_attempt >= 2
    if stage == CodingStage.REPAIR_EXPERT or repair_attempt >= 4 or prior_failures >= 4:
        return StageRoute(
            model=s.MODEL_CODING_EXTERNAL_EXPERT,
            profile=ModelProfile.CODING,
            reasoning_effort=ReasoningEffort.HIGH,
            timeout_seconds=s.LLM_TIMEOUT_CODING_HARD,
            escalation_tier=3,
        )
    if hard_failure:
        # Same house, more thinking: the strongest OpenAI model we have, at the
        # highest effort, before the bill changes vendor.
        return StageRoute(
            model=s.MODEL_CODING_EXPERT,
            profile=ModelProfile.CODING,
            reasoning_effort=ReasoningEffort.XHIGH,
            timeout_seconds=s.LLM_TIMEOUT_CODING_HARD,
            escalation_tier=2,
        )
    if stage in {CodingStage.ARCHITECTURE, CodingStage.REPAIR_HARD}:
        return StageRoute(
            model=s.MODEL_CODING_EXPERT,
            profile=ModelProfile.CODING,
            reasoning_effort=ReasoningEffort.HIGH if stage == CodingStage.ARCHITECTURE else ReasoningEffort.XHIGH,
            timeout_seconds=s.LLM_TIMEOUT_CODING_HARD,
            escalation_tier=1,
        )
    if stage == CodingStage.DIAGNOSE:
        return StageRoute(
            model=s.MODEL_CODING_PRIMARY,
            profile=ModelProfile.CODING,
            reasoning_effort=ReasoningEffort.HIGH,
            timeout_seconds=s.LLM_TIMEOUT_CODING,
        )
    if stage == CodingStage.VALIDATE:
        return StageRoute(
            model=s.MODEL_VALIDATOR_PRIMARY,
            profile=ModelProfile.VALIDATOR,
            reasoning_effort=ReasoningEffort.MEDIUM,
            timeout_seconds=s.LLM_TIMEOUT_VALIDATOR,
        )
    return StageRoute(
        model=s.MODEL_CODING_PRIMARY,
        profile=ModelProfile.CODING,
        reasoning_effort=ReasoningEffort.MEDIUM,
        timeout_seconds=s.LLM_TIMEOUT_CODING,
    )


def route_task_profile(
    profile: ModelProfile,
    *,
    complexity_heavy: bool = False,
) -> StageRoute:
    """Non-coding platform tasks."""
    s = _settings()
    if profile == ModelProfile.FAST:
        return StageRoute(
            model=s.MODEL_FAST_PRIMARY,
            profile=profile,
            reasoning_effort=ReasoningEffort.LOW,
            timeout_seconds=s.LLM_TIMEOUT_FAST,
        )
    if profile == ModelProfile.BALANCED:
        return StageRoute(
            model=s.MODEL_BALANCED_PRIMARY,
            profile=profile,
            reasoning_effort=ReasoningEffort.MEDIUM,
            timeout_seconds=s.LLM_TIMEOUT_BALANCED,
        )
    if profile == ModelProfile.REASONING:
        model = s.MODEL_REASONING_EXPERT if complexity_heavy else s.MODEL_REASONING_PRIMARY
        return StageRoute(
            model=model,
            profile=profile,
            reasoning_effort=ReasoningEffort.HIGH if complexity_heavy else ReasoningEffort.MEDIUM,
            timeout_seconds=s.LLM_TIMEOUT_REASONING,
        )
    if profile == ModelProfile.VALIDATOR:
        return StageRoute(
            model=s.MODEL_VALIDATOR_PRIMARY,
            profile=profile,
            reasoning_effort=ReasoningEffort.MEDIUM,
            timeout_seconds=s.LLM_TIMEOUT_VALIDATOR,
        )
    return StageRoute(
        model=s.MODEL_CODING_PRIMARY,
        profile=ModelProfile.CODING,
        reasoning_effort=ReasoningEffort.MEDIUM,
        timeout_seconds=s.LLM_TIMEOUT_CODING,
    )


def profile_timeout_seconds(profile: ModelProfile) -> int:
    s = _settings()
    mapping = {
        ModelProfile.FAST: s.LLM_TIMEOUT_FAST,
        ModelProfile.BALANCED: s.LLM_TIMEOUT_BALANCED,
        ModelProfile.REASONING: s.LLM_TIMEOUT_REASONING,
        ModelProfile.CODING: s.LLM_TIMEOUT_CODING,
        ModelProfile.VALIDATOR: s.LLM_TIMEOUT_VALIDATOR,
        ModelProfile.EMBEDDING: s.LLM_TIMEOUT_FAST,
    }
    return mapping.get(profile, s.LLM_CALL_TIMEOUT_SECONDS)


def _dedupe(items: list[str]) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for item in items:
        token = (item or "").strip()
        if token and token not in seen:
            seen.add(token)
            out.append(token)
    return out
