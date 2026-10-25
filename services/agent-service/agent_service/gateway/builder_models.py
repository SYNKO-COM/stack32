"""Allowlisted Builder models; unrelated to a generated agent's BYOK model."""
from __future__ import annotations

from contextvars import ContextVar
from functools import wraps
from typing import Literal

from agent_service.config import get_settings

BuilderModelTier = Literal["fast", "standard", "max"]
BUILDER_MODELS = {
    "fast": "openai/gpt-6-luna",
    "standard": "openai/gpt-6.1-sol",
    "max": "openai/gpt-6-astra",
}
_current_tier: ContextVar[str | None] = ContextVar("builder_model_tier", default=None)


def selected_builder_model() -> str | None:
    return BUILDER_MODELS.get(_current_tier.get() or "")


def builder_model_scope(fn):
    """Restore the persisted choice on queued turns and every form continuation."""
    @wraps(fn)
    async def wrapped(self, *args, **kwargs):
        run = await self.db.get_owned_run(kwargs["run_id"], kwargs["user_id"])
        payload = (run or {}).get("input") or {}
        tier = payload.get("model_tier") if isinstance(payload, dict) else None
        # Existing turns retain their stage routing. Never change live/BYOK defaults.
        if tier is not None and (tier not in BUILDER_MODELS or not get_settings().BUILDER_MODEL_SELECTION_ENABLED):
            raise ValueError("BUILDER_MODEL_UNAVAILABLE")
        token = _current_tier.set(tier)
        try:
            from agent_service.security.llm_budget import llm_run_budget
            agent_id = kwargs.get("agent_id") or (run or {}).get("agent_id")
            if not agent_id:
                # Let the endpoint return its normal owned-run / interrupt error.
                return await fn(self, *args, **kwargs)
            async with llm_run_budget(
                run_id=kwargs["run_id"], user_id=kwargs["user_id"], agent_id=str(agent_id),
            ):
                return await fn(self, *args, **kwargs)
        finally:
            _current_tier.reset(token)
    return wrapped
