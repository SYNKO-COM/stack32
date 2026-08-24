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
    #: Two Codex rungs between the primary and sol. Cheaper on input than
    #: either, and built for code, so the ladder climbs in ability without
    #: jumping straight to the dearest model in the registry.
    REPAIR_CODEX = "repair_codex"
    REPAIR_CODEX_MAX = "repair_codex_max"
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
        if stage in {CodingStage.REPAIR_CODEX, CodingStage.REPAIR_CODEX_MAX}:
            return _dedupe([
                s.MODEL_CODING_CODEX_FIRST,
                s.MODEL_CODING_CODEX_SECOND,
                s.MODEL_CODING_PRIMARY,
            ])
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


#: The repair ladder, in one place. It used to live in three: build_pipeline
#: named stages, the coding agent named its own two, and route_coding_stage
#: carried a numeric override that jumped straight to the external expert once
#: `repair_attempt >= 4`. A live build spent 19 calls on Claude and none on
#: Codex because the override fired while the stage still said `repair_hard`.
_REPAIR_LADDER: tuple[str, ...] = (
    "patch",             # terra
    "patch",             # terra again
    "repair_codex",      # gpt-5.2-codex
    "repair_codex_max",  # gpt-5.3-codex
    "repair_hard",       # sol, heaviest reasoning
    "repair_expert",     # anthropic, capped by MAX_EXTERNAL_EXPERT_CALLS
)


def coding_stage_for_attempt(attempt: int) -> str:
    """Which rung a repair attempt stands on. Zero-based."""
    if attempt < 0:
        attempt = 0
    return _REPAIR_LADDER[min(attempt, len(_REPAIR_LADDER) - 1)]


def uses_external_expert(stage: str) -> bool:
    """True when this rung leaves OpenAI for the other vendor."""
    return stage == CodingStage.REPAIR_EXPERT.value


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
    # The caller names the rung; the router no longer second-guesses it with a
    # numeric override, which is what silently skipped the Codex rungs.
    if stage == CodingStage.REPAIR_EXPERT:
        return StageRoute(
            model=s.MODEL_CODING_EXTERNAL_EXPERT,
            profile=ModelProfile.CODING,
            reasoning_effort=ReasoningEffort.HIGH,
            timeout_seconds=s.LLM_TIMEOUT_CODING_HARD,
            escalation_tier=3,
        )
    if stage in {CodingStage.REPAIR_CODEX, CodingStage.REPAIR_CODEX_MAX}:
        return StageRoute(
            model=(
                s.MODEL_CODING_CODEX_FIRST
                if stage == CodingStage.REPAIR_CODEX
                else s.MODEL_CODING_CODEX_SECOND
            ),
            profile=ModelProfile.CODING,
            reasoning_effort=ReasoningEffort.HIGH,
            timeout_seconds=s.LLM_TIMEOUT_CODING_HARD,
            escalation_tier=1,
        )
    if stage == CodingStage.ARCHITECTURE:
        # The first version of an agent decides how much repairing follows, so
        # it gets a model built for code rather than the dearest one in the
        # registry: same class of result, roughly a third of sol's input price.
        return StageRoute(
            model=s.MODEL_CODING_INITIAL,
            profile=ModelProfile.CODING,
            reasoning_effort=ReasoningEffort.HIGH,
            timeout_seconds=s.LLM_TIMEOUT_CODING_HARD,
            escalation_tier=1,
        )
    if stage == CodingStage.REPAIR_HARD:
        return StageRoute(
            model=s.MODEL_CODING_EXPERT,
            profile=ModelProfile.CODING,
            reasoning_effort=ReasoningEffort.XHIGH,
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
