"""LiteLLM-backed ModelGateway — single entry for all LLM calls."""

from __future__ import annotations

import logging
import time
from enum import StrEnum
from typing import Any, TypeVar

from pydantic import BaseModel

from agent_service.config import get_settings
from agent_service.security.redaction import redact_obj

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)


def _model_omits_temperature(model_lower: str) -> bool:
    """True when the provider rejects non-default temperature for this model."""
    # gpt-5 / gpt-5.x, o1/o3/o4 reasoning, and Codex only accept the default.
    if "codex" in model_lower:
        return True
    if "/o1" in model_lower or model_lower.startswith("o1") or "/o1-" in model_lower:
        return True
    if "/o3" in model_lower or model_lower.startswith("o3") or "/o3-" in model_lower:
        return True
    if "/o4" in model_lower or model_lower.startswith("o4") or "/o4-" in model_lower:
        return True
    # Match gpt-5, gpt-5.5, gpt-5-mini, openai/gpt-5.5, etc.
    if "gpt-5" in model_lower:
        return True
    return False


class ModelProfile(StrEnum):
    FAST = "fast"
    BALANCED = "balanced"
    REASONING = "reasoning"
    CODING = "coding"
    VALIDATOR = "validator"
    EMBEDDING = "embedding"


class ProviderHealth(BaseModel):
    provider: str
    status: str  # configured | missing_key | healthy | degraded | unavailable
    detail: str = ""


class ModelCallResult(BaseModel):
    content: str
    provider: str
    model: str
    input_tokens: int = 0
    output_tokens: int = 0
    cost_usd: float = 0.0
    latency_ms: int = 0
    tool_calls: list[dict[str, Any]] = []


class CircuitBreaker:
    def __init__(self, failure_threshold: int = 5, cooldown_seconds: int = 60) -> None:
        self.failure_threshold = failure_threshold
        self.cooldown_seconds = cooldown_seconds
        self._failures: dict[str, int] = {}
        self._open_until: dict[str, float] = {}

    def allow(self, key: str) -> bool:
        until = self._open_until.get(key, 0)
        return time.time() >= until

    def record_success(self, key: str) -> None:
        self._failures[key] = 0
        self._open_until.pop(key, None)

    def record_failure(self, key: str) -> None:
        self._failures[key] = self._failures.get(key, 0) + 1
        if self._failures[key] >= self.failure_threshold:
            self._open_until[key] = time.time() + self.cooldown_seconds
            logger.warning("Circuit open for provider/model key=%s", key)

    def record_hard_failure(self, key: str, *, cooldown_seconds: int | None = None) -> None:
        """Immediate open — e.g. BadRequest/NotFound for a dead model id."""
        seconds = cooldown_seconds if cooldown_seconds is not None else self.cooldown_seconds * 30
        self._failures[key] = self.failure_threshold
        self._open_until[key] = time.time() + max(60, seconds)
        logger.warning("Circuit hard-open for provider/model key=%s cooldown=%ss", key, seconds)


_breaker = CircuitBreaker()


PROFILE_ENV = {
    ModelProfile.FAST: ("MODEL_FAST_PRIMARY", "MODEL_FAST_FALLBACK"),
    ModelProfile.BALANCED: ("MODEL_BALANCED_PRIMARY", "MODEL_BALANCED_FALLBACK"),
    ModelProfile.REASONING: ("MODEL_REASONING_PRIMARY", "MODEL_REASONING_FALLBACK"),
    ModelProfile.CODING: ("MODEL_CODING_PRIMARY", "MODEL_CODING_FALLBACK"),
    ModelProfile.VALIDATOR: ("MODEL_VALIDATOR_PRIMARY", "MODEL_VALIDATOR_FALLBACK"),
    ModelProfile.EMBEDDING: ("MODEL_EMBEDDING_PRIMARY",),
}


def _provider_from_model(model: str) -> str:
    if "/" in model:
        return model.split("/", 1)[0]
    return "unknown"


def _provider_key_present(provider: str) -> bool:
    settings = get_settings()
    mapping = {
        "openai": settings.OPENAI_API_KEY,
        "xai": settings.XAI_API_KEY,
        "anthropic": settings.ANTHROPIC_API_KEY,
        "gemini": settings.GEMINI_API_KEY,
        "google": settings.GEMINI_API_KEY or settings.GOOGLE_CLOUD_PROJECT,
        "mistral": settings.MISTRAL_API_KEY,
        "cohere": settings.COHERE_API_KEY,
        "groq": settings.GROQ_API_KEY,
        "openrouter": settings.OPENROUTER_API_KEY,
        "azure": settings.AZURE_OPENAI_API_KEY,
        "bedrock": settings.AWS_ACCESS_KEY_ID,
    }
    return bool(mapping.get(provider))


def resolve_models(profile: ModelProfile) -> list[str]:
    settings = get_settings()
    names = PROFILE_ENV[profile]
    models: list[str] = []
    for env_name in names:
        value = getattr(settings, env_name, "") or ""
        if value and value not in models:
            models.append(value)
    # Coding repairs must degrade to working chat models when specialized IDs fail.
    if profile == ModelProfile.CODING:
        for env_name in PROFILE_ENV[ModelProfile.BALANCED]:
            value = getattr(settings, env_name, "") or ""
            if value and value not in models:
                models.append(value)
    return models


def provider_health() -> list[ProviderHealth]:
    providers = [
        ("openai", "OPENAI_API_KEY"),
        ("xai", "XAI_API_KEY"),
        ("anthropic", "ANTHROPIC_API_KEY"),
        ("gemini", "GEMINI_API_KEY"),
        ("mistral", "MISTRAL_API_KEY"),
        ("cohere", "COHERE_API_KEY"),
        ("groq", "GROQ_API_KEY"),
        ("openrouter", "OPENROUTER_API_KEY"),
    ]
    settings = get_settings()
    out: list[ProviderHealth] = []
    for name, attr in providers:
        key = getattr(settings, attr, "")
        if not key:
            out.append(ProviderHealth(provider=name, status="missing_key"))
        else:
            out.append(ProviderHealth(provider=name, status="configured"))
    return out


class ModelGateway:
    """Application-facing gateway. Business logic never imports provider SDKs."""

    def __init__(self) -> None:
        self._breaker = _breaker

    async def complete(
        self,
        *,
        profile: ModelProfile,
        messages: list[dict[str, Any]],
        response_model: type[T] | None = None,
        temperature: float = 0.3,
        max_tokens: int = 2048,
        api_key: str | None = None,
        provider: str | None = None,
        tools: list[dict[str, Any]] | None = None,
        model: str | None = None,
    ) -> ModelCallResult | T:
        import asyncio

        from agent_service.security.llm_budget import (
            LlmCallBudgetExceeded,
            get_run_llm_budget,
        )

        settings = get_settings()
        budget = get_run_llm_budget()
        if budget is not None and budget.calls >= budget.max_calls:
            raise LlmCallBudgetExceeded()

        timeout = float(settings.LLM_CALL_TIMEOUT_SECONDS)
        try:
            result = await asyncio.wait_for(
                self._complete_inner(
                    profile=profile,
                    messages=messages,
                    response_model=response_model,
                    temperature=temperature,
                    max_tokens=max_tokens,
                    api_key=api_key,
                    provider=provider,
                    tools=tools,
                    model=model,
                ),
                timeout=timeout,
            )
        except TimeoutError as exc:
            logger.warning("LLM call timed out after %ss profile=%s", timeout, profile)
            raise RuntimeError("MODEL_PROVIDER_UNAVAILABLE") from exc

        if budget is not None and hasattr(result, "model"):
            budget.register_call(
                model=str(getattr(result, "model", profile.value)),
                input_tokens=int(getattr(result, "input_tokens", 0) or 0),
                output_tokens=int(getattr(result, "output_tokens", 0) or 0),
                cost_usd=float(getattr(result, "cost_usd", 0) or 0),
            )
        elif budget is not None:
            # Structured response_model path — still counts as a call.
            budget.register_call(model=f"{profile.value}:structured")
        return result

    async def _complete_inner(
        self,
        *,
        profile: ModelProfile,
        messages: list[dict[str, Any]],
        response_model: type[T] | None,
        temperature: float,
        max_tokens: int,
        api_key: str | None,
        provider: str | None,
        tools: list[dict[str, Any]] | None = None,
        model: str | None = None,
    ) -> ModelCallResult | T:
        settings = get_settings()
        if settings.AI_EXECUTION_MODE == "mock":
            return self._mock_complete(profile, messages, response_model, tools=tools)

        if settings.AI_EXECUTION_MODE == "disabled":
            raise RuntimeError("MODEL_PROVIDER_UNAVAILABLE")

        # BYOK path: force a specific provider + user key (Live agents).
        if api_key and provider:
            route = (model or "").strip() or self._model_for_provider_profile(provider, profile)
            if not route:
                raise RuntimeError("MODEL_PROVIDER_UNAVAILABLE")
            try:
                result = await self._litellm_complete(
                    model=route,
                    messages=redact_obj(messages),
                    temperature=temperature,
                    max_tokens=max_tokens,
                    response_model=response_model,
                    api_key=api_key,
                    tools=tools,
                )
                self._breaker.record_success(route)
                return result
            except Exception as exc:  # noqa: BLE001
                self._breaker.record_failure(route)
                raise RuntimeError("MODEL_PROVIDER_UNAVAILABLE") from exc

        if not settings.has_any_llm_provider:
            raise RuntimeError("MODEL_PROVIDER_UNAVAILABLE")

        models = resolve_models(profile)
        last_error: Exception | None = None
        safe_messages = redact_obj(messages)

        for model in models:
            model_provider = _provider_from_model(model)
            if not _provider_key_present(model_provider):
                continue
            if not self._breaker.allow(model):
                continue
            try:
                result = await self._litellm_complete(
                    model=model,
                    messages=safe_messages,
                    temperature=temperature,
                    max_tokens=max_tokens,
                    response_model=response_model,
                    tools=tools,
                )
                self._breaker.record_success(model)
                return result
            except Exception as exc:  # noqa: BLE001 — normalized upstream
                err_name = type(exc).__name__
                self._breaker.record_failure(model)
                # Invalid / unsupported model ids should not burn the whole coding loop.
                if err_name in {"BadRequestError", "NotFoundError", "AuthenticationError"}:
                    self._breaker.record_hard_failure(model)
                last_error = exc
                logger.warning("Model call failed model=%s err=%s", model, err_name)

        raise RuntimeError("MODEL_PROVIDER_UNAVAILABLE") from last_error

    def _model_for_provider_profile(self, provider: str, profile: ModelProfile) -> str | None:
        settings = get_settings()
        provider = provider.lower()
        mapping = {
            ("openai", ModelProfile.FAST): "openai/gpt-4.1-mini",
            ("openai", ModelProfile.BALANCED): "openai/gpt-4.1-mini",
            ("openai", ModelProfile.REASONING): "openai/gpt-4.1",
            ("openai", ModelProfile.CODING): "openai/gpt-4.1",
            ("openai", ModelProfile.VALIDATOR): "openai/gpt-4.1-mini",
            ("xai", ModelProfile.FAST): "xai/grok-3-mini",
            ("xai", ModelProfile.BALANCED): "xai/grok-3-mini",
            ("xai", ModelProfile.REASONING): settings.MODEL_REASONING_PRIMARY or "xai/grok-4.5",
            ("xai", ModelProfile.CODING): "xai/grok-code-fast-1",
            ("xai", ModelProfile.VALIDATOR): "xai/grok-3-mini",
            ("anthropic", ModelProfile.FAST): "anthropic/claude-3-5-haiku-latest",
            ("anthropic", ModelProfile.BALANCED): "anthropic/claude-sonnet-4-5",
            ("anthropic", ModelProfile.REASONING): "anthropic/claude-sonnet-4-5",
            ("anthropic", ModelProfile.CODING): "anthropic/claude-sonnet-4-5",
            ("google", ModelProfile.FAST): "gemini/gemini-2.0-flash",
            ("google", ModelProfile.BALANCED): "gemini/gemini-2.0-flash",
            ("google", ModelProfile.REASONING): "gemini/gemini-2.5-pro",
            ("google", ModelProfile.CODING): "gemini/gemini-2.5-pro",
            ("google", ModelProfile.VALIDATOR): "gemini/gemini-2.0-flash",
            ("gemini", ModelProfile.FAST): "gemini/gemini-2.0-flash",
            ("gemini", ModelProfile.BALANCED): "gemini/gemini-2.0-flash",
            ("gemini", ModelProfile.REASONING): "gemini/gemini-2.5-pro",
            ("gemini", ModelProfile.CODING): "gemini/gemini-2.5-pro",
            ("gemini", ModelProfile.VALIDATOR): "gemini/gemini-2.0-flash",
            ("mistral", ModelProfile.FAST): "mistral/mistral-small-latest",
            ("mistral", ModelProfile.BALANCED): "mistral/mistral-small-latest",
            ("mistral", ModelProfile.REASONING): "mistral/mistral-large-latest",
            ("mistral", ModelProfile.CODING): "mistral/codestral-latest",
            ("mistral", ModelProfile.VALIDATOR): "mistral/mistral-small-latest",
            ("groq", ModelProfile.FAST): "groq/llama-3.1-8b-instant",
            ("groq", ModelProfile.BALANCED): "groq/llama-3.3-70b-versatile",
            ("groq", ModelProfile.REASONING): "groq/llama-3.3-70b-versatile",
            ("groq", ModelProfile.CODING): "groq/llama-3.3-70b-versatile",
            ("groq", ModelProfile.VALIDATOR): "groq/llama-3.1-8b-instant",
            ("openrouter", ModelProfile.FAST): "openrouter/openai/gpt-4.1-mini",
            ("openrouter", ModelProfile.BALANCED): "openrouter/openai/gpt-4.1-mini",
            ("openrouter", ModelProfile.REASONING): "openrouter/xai/grok-4.5",
            ("openrouter", ModelProfile.CODING): "openrouter/openai/gpt-4.1",
        }
        return mapping.get((provider, profile)) or mapping.get((provider, ModelProfile.BALANCED))

    async def embed(self, texts: list[str]) -> list[list[float]]:
        settings = get_settings()
        if settings.AI_EXECUTION_MODE == "mock":
            dim = settings.EMBEDDING_DIMENSION
            return [[float((hash(t) % 1000) / 1000.0)] * dim for t in texts]

        models = resolve_models(ModelProfile.EMBEDDING)
        if not models:
            raise RuntimeError("MODEL_PROVIDER_UNAVAILABLE")
        model = models[0]
        try:
            from litellm import aembedding
        except ImportError as exc:
            raise RuntimeError("MODEL_PROVIDER_UNAVAILABLE") from exc

        response = await aembedding(model=model, input=texts)
        data = response.get("data") if isinstance(response, dict) else response.data
        return [item["embedding"] if isinstance(item, dict) else item.embedding for item in data]

    async def _litellm_complete(
        self,
        *,
        model: str,
        messages: list[dict[str, Any]],
        temperature: float,
        max_tokens: int,
        response_model: type[T] | None,
        api_key: str | None = None,
        tools: list[dict[str, Any]] | None = None,
    ) -> ModelCallResult | T:
        from litellm import acompletion

        started = time.perf_counter()
        model_l = model.lower()
        # Codex / GPT-5 / o-series often reject custom temperature (only default 1).
        is_codex = "codex" in model_l
        omit_temperature = _model_omits_temperature(model_l)
        kwargs: dict[str, Any] = {
            "model": model,
            "messages": messages,
            "max_tokens": max_tokens,
        }
        if not omit_temperature:
            kwargs["temperature"] = temperature
        if api_key:
            kwargs["api_key"] = api_key
        if response_model is not None:
            kwargs["response_format"] = {"type": "json_object"}
        if tools:
            kwargs["tools"] = tools
            kwargs["tool_choice"] = "auto"

        try:
            response = await acompletion(**kwargs)
        except Exception as chat_exc:  # noqa: BLE001
            # Retry once without temperature if the provider rejects it.
            err_text = str(chat_exc).lower()
            if "temperature" in kwargs and "temperature" in err_text:
                kwargs.pop("temperature", None)
                logger.info(
                    "Retrying without temperature model=%s err=%s",
                    model,
                    type(chat_exc).__name__,
                )
                response = await acompletion(**kwargs)
            elif not is_codex or tools:
                raise
            else:
                # Fallback: OpenAI Codex often requires the Responses API.
                logger.info("Codex chat failed (%s); trying Responses API", type(chat_exc).__name__)
                response = await self._litellm_responses(
                    model=model,
                    messages=messages,
                    max_tokens=max_tokens,
                    api_key=api_key,
                )

        latency_ms = int((time.perf_counter() - started) * 1000)
        choice = response.choices[0]
        message = choice.message
        content = message.content or ""
        raw_tool_calls = getattr(message, "tool_calls", None) or []
        parsed_calls: list[dict[str, Any]] = []
        for tc in raw_tool_calls:
            fn = getattr(tc, "function", None)
            name = getattr(fn, "name", None) if fn is not None else None
            args_raw = getattr(fn, "arguments", "{}") if fn is not None else "{}"
            call_id = getattr(tc, "id", None) or f"call_{len(parsed_calls)}"
            if not name:
                continue
            try:
                import json

                arguments = json.loads(args_raw) if isinstance(args_raw, str) else (args_raw or {})
            except Exception:  # noqa: BLE001
                arguments = {"_raw": args_raw}
            if not isinstance(arguments, dict):
                arguments = {"value": arguments}
            parsed_calls.append(
                {"call_id": str(call_id), "tool_id": str(name), "arguments": arguments}
            )

        usage = getattr(response, "usage", None)
        input_tokens = int(getattr(usage, "prompt_tokens", 0) or 0)
        output_tokens = int(getattr(usage, "completion_tokens", 0) or 0)
        cost = float(getattr(response, "_hidden_params", {}).get("response_cost", 0) or 0)
        if cost <= 0 and (input_tokens > 0 or output_tokens > 0):
            from agent_service.billing.plans import estimate_cost_usd_from_tokens

            cost = estimate_cost_usd_from_tokens(model, input_tokens, output_tokens)

        result = ModelCallResult(
            content=content,
            provider=_provider_from_model(model),
            model=model,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            cost_usd=cost,
            latency_ms=latency_ms,
            tool_calls=parsed_calls,
        )
        if response_model is not None:
            return response_model.model_validate_json(content)
        return result

    async def _litellm_responses(
        self,
        *,
        model: str,
        messages: list[dict[str, str]],
        max_tokens: int,
        api_key: str | None = None,
    ) -> Any:
        """Call OpenAI Responses API via LiteLLM (required by some Codex models)."""
        from litellm import aresponses

        # Flatten chat messages into a single Responses input string.
        parts: list[str] = []
        for m in messages:
            role = m.get("role", "user")
            parts.append(f"{role.upper()}: {m.get('content', '')}")
        kwargs: dict[str, Any] = {
            "model": model,
            "input": "\n\n".join(parts),
            "max_output_tokens": max_tokens,
        }
        if api_key:
            kwargs["api_key"] = api_key
        raw = await aresponses(**kwargs)
        # Normalize to a chat-completions-like object for callers.
        text = ""
        if hasattr(raw, "output_text"):
            text = raw.output_text or ""
        elif isinstance(raw, dict):
            text = str(raw.get("output_text") or "")
        if not text and hasattr(raw, "output"):
            chunks: list[str] = []
            for item in raw.output or []:
                content = getattr(item, "content", None) or (
                    item.get("content") if isinstance(item, dict) else None
                )
                if not content:
                    continue
                for part in content:
                    t = getattr(part, "text", None) or (
                        part.get("text") if isinstance(part, dict) else None
                    )
                    if t:
                        chunks.append(str(t))
            text = "".join(chunks)

        class _Msg:
            content = text

        class _Choice:
            message = _Msg()

        class _Usage:
            prompt_tokens = int(getattr(getattr(raw, "usage", None), "input_tokens", 0) or 0)
            completion_tokens = int(getattr(getattr(raw, "usage", None), "output_tokens", 0) or 0)

        class _Resp:
            choices = [_Choice()]
            usage = _Usage()
            _hidden_params: dict[str, Any] = {}

        return _Resp()
    def _mock_complete(
        self,
        profile: ModelProfile,
        messages: list[dict[str, Any]],
        response_model: type[T] | None,
        tools: list[dict[str, Any]] | None = None,
    ) -> ModelCallResult | T:
        user_text = next(
            (str(m.get("content") or "") for m in reversed(messages) if m.get("role") == "user"),
            "",
        )
        tool_names = {
            (t.get("function") or {}).get("name")
            for t in (tools or [])
            if isinstance(t, dict)
        }
        # Agentic mock: if calculator is available and expression-like input, emit a tool call.
        if "calculator" in tool_names and any(ch.isdigit() for ch in user_text) and any(
            op in user_text for op in ("+", "-", "*", "/", "=")
        ):
            # Avoid re-calling tools when observations are already present.
            has_tool_msg = any(m.get("role") == "tool" for m in messages)
            if not has_tool_msg:
                import re

                expr = re.sub(r"[^0-9+\-*/(). ]", "", user_text).strip() or "1+1"
                return ModelCallResult(
                    content="",
                    provider="mock",
                    model=f"mock/{profile.value}",
                    input_tokens=40,
                    output_tokens=20,
                    tool_calls=[
                        {
                            "call_id": "call_mock_calc",
                            "tool_id": "calculator",
                            "arguments": {"expression": expr},
                        }
                    ],
                )
            return ModelCallResult(
                content=f"Based on the calculator result, the answer is ready. ({user_text[:120]})",
                provider="mock",
                model=f"mock/{profile.value}",
                input_tokens=80,
                output_tokens=40,
            )

        name = "Research Assistant"
        role = "Help the user research and summarize information"
        if "name" in user_text.lower():
            name = "Custom Agent"
        content = (
            f'{{"name":"{name}","role":"{role}","tone":"professional",'
            f'"description":"Mock-generated agent for {user_text[:80]}"}}'
        )
        if response_model is not None:
            # Best-effort empty/default instance for structured mocks
            try:
                return response_model.model_validate_json(content)
            except Exception:  # noqa: BLE001
                return response_model.model_validate({})
        return ModelCallResult(
            content=content if not tools else f"Mock live answer for: {user_text[:200]}",
            provider="mock",
            model=f"mock/{profile.value}",
            input_tokens=100,
            output_tokens=50,
            cost_usd=0.0,
            latency_ms=5,
        )


_gateway: ModelGateway | None = None


def get_model_gateway() -> ModelGateway:
    global _gateway
    if _gateway is None:
        _gateway = ModelGateway()
    return _gateway
