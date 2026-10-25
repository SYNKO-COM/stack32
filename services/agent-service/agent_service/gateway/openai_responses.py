"""GPT-6 Responses boundary, preserving real tool calls and provider usage."""
from __future__ import annotations

import hashlib
import json
import re
import time
from typing import Any

from openai import AsyncOpenAI

from agent_service.billing.pricing import estimate_cost_usd_from_tokens
from agent_service.config import get_settings
from agent_service.security.llm_budget import get_run_llm_budget


def provider_tool_name(name: str) -> str:
    # Runtime ids contain dots/colons; provider function names permit neither.
    if re.fullmatch(r"[a-zA-Z0-9_-]{1,64}", name):
        return name
    return "tool_" + hashlib.sha256(name.encode()).hexdigest()[:40]


def responses_input(messages: list[dict[str, Any]], reasoning: dict[str, list] | None = None) -> list[dict]:
    items: list[dict] = []
    for message in messages:
        role = message.get("role", "user")
        content = message.get("content")
        if role == "tool":
            items.append({"type": "function_call_output", "call_id": message["tool_call_id"],
                          "output": content if isinstance(content, str) else json.dumps(content)})
            continue
        if content:
            if isinstance(content, list):
                parts = []
                for part in content:
                    if part.get("type") == "text":
                        parts.append({"type": "input_text", "text": part["text"]})
                    elif part.get("type") == "image_url":
                        image = part["image_url"]
                        parts.append({"type": "input_image", "image_url": image["url"],
                                      "detail": image.get("detail", "auto")})
                content = parts
            items.append({"role": role, "content": content})
        calls = message.get("tool_calls") or []
        if calls:
            items.extend((reasoning or {}).get(calls[0]["id"], []))
        for call in calls:
            fn = call["function"]
            items.append({"type": "function_call", "call_id": call["id"], "name": provider_tool_name(fn["name"]),
                          "arguments": fn["arguments"]})
    return items


async def complete_responses(*, model: str, messages: list[dict[str, Any]], max_tokens: int,
                             api_key: str | None, tools: list[dict] | None,
                             reasoning_effort: str | None, json_output: bool):
    from agent_service.gateway.model_gateway import ModelCallResult

    budget = get_run_llm_budget()
    history = budget.responses_reasoning if budget else {}
    effort = reasoning_effort or "low"
    if effort in {"none", "minimal"} and ("astra" in model or "6.1-sol" in model):
        effort = "low"
    kwargs: dict[str, Any] = {
        "model": model.split("/", 1)[-1], "input": responses_input(messages, history),
        "reasoning": {"effort": effort}, "max_output_tokens": max(4096, max_tokens),
        "store": False, "include": ["reasoning.encrypted_content"],
    }
    tool_names = {provider_tool_name(t["function"]["name"]): t["function"]["name"] for t in (tools or [])}
    if tools:
        kwargs["tools"] = [
            {"type": "function", **t["function"], "name": provider_tool_name(t["function"]["name"]), "strict": False}
            for t in tools
        ]
        kwargs["tool_choice"] = "auto"
    if json_output:
        kwargs["text"] = {"format": {"type": "json_object"}}
    started = time.perf_counter()
    async with AsyncOpenAI(api_key=api_key or get_settings().OPENAI_API_KEY,
                          timeout=180, max_retries=0) as client:
        response = await client.responses.create(**kwargs)
    usage = response.usage
    input_tokens = usage.input_tokens if usage else 0
    output_tokens = usage.output_tokens if usage else 0
    cached = int(getattr(getattr(usage, "input_tokens_details", None), "cached_tokens", 0) or 0)
    cost, _ = estimate_cost_usd_from_tokens(model, input_tokens, output_tokens, cached_input_tokens=cached)
    calls = []
    reasoning_items = [item.model_dump(exclude_none=True) for item in response.output if item.type == "reasoning"]
    for item in response.output:
        if item.type != "function_call":
            continue
        history[item.call_id] = reasoning_items
        try:
            arguments = json.loads(item.arguments)
        except (ValueError, TypeError):
            arguments = {"_raw": item.arguments}
        calls.append({"call_id": item.call_id, "tool_id": tool_names.get(item.name, item.name), "arguments": arguments})
    return ModelCallResult(
        content=response.output_text or "", provider="openai", model=model,
        input_tokens=input_tokens, output_tokens=output_tokens, cost_usd=cost,
        latency_ms=int((time.perf_counter() - started) * 1000), tool_calls=calls, usage_id=response.id,
    )
