"""Conversation context for generated-agent Live runs."""

from __future__ import annotations

from typing import Any

from agent_service.supabase_client import Persistence

# Rough char budget ≈ tokens * 4 for truncation without a tokenizer dependency.
_DEFAULT_CHAR_BUDGET = 24_000


def strip_current_user_turn(messages: list[dict[str, str]]) -> list[dict[str, str]]:
    """Drop trailing user messages — the current turn is appended by the runtime.

    The web client inserts the user message before the run starts, so
    ``load_live_history`` would otherwise duplicate it in the LLM seed.
    """
    out = list(messages)
    while out and out[-1].get("role") == "user":
        out.pop()
    return out


def has_prior_conversation_context(
    *,
    history: list[dict[str, str]],
    conversation_summary: str | None = None,
) -> bool:
    """True from the 2nd Live message onward (prior turns and/or rolling summary)."""
    if (conversation_summary or "").strip():
        return True
    return any(m.get("role") == "assistant" for m in history) or len(history) >= 1


def append_rolling_summary(
    previous: str | None,
    *,
    user_text: str,
    assistant_text: str,
    max_chars: int = 4000,
) -> str:
    """Grow a rolling thread summary so older turns survive beyond the message window."""
    chunk = f"User: {user_text[:400]}\nAssistant: {assistant_text[:800]}".strip()
    prev = (previous or "").strip()
    if not prev:
        return chunk[:max_chars]
    if not chunk:
        return prev[:max_chars]
    combined = f"{prev}\n\n{chunk}"
    if len(combined) <= max_chars:
        return combined
    # Keep the newest tail of the rolling summary.
    return combined[-max_chars:]


async def load_live_history(
    *,
    db: Persistence,
    thread_id: str,
    user_id: str,
    agent_id: str,
    window: int = 20,
    char_budget: int = _DEFAULT_CHAR_BUDGET,
) -> list[dict[str, str]]:
    """Load recent Live messages with correct roles; truncate oldest first."""
    rows = await db._select(
        "live_messages",
        {
            "thread_id": f"eq.{thread_id}",
            "user_id": f"eq.{user_id}",
            "agent_id": f"eq.{agent_id}",
            "select": "id,role,content,created_at",
            "order": "created_at.desc",
            # Fetch one extra so after stripping the current user turn we still
            # fill the configured conversation window.
            "limit": str(max(1, window + 1)),
        },
    )
    if not isinstance(rows, list):
        return []
    chronological = list(reversed(rows))
    out: list[dict[str, str]] = []
    for row in chronological:
        role = row.get("role")
        content = str(row.get("content") or "").strip()
        if role not in ("user", "assistant", "system", "tool") or not content:
            continue
        # Skip i18n keys / UI-only prompts from history context
        if content.startswith("live:") or content.startswith("builder:"):
            continue
        out.append({"role": str(role), "content": content[:8000]})

    out = strip_current_user_turn(out)
    if window > 0 and len(out) > window:
        out = out[-window:]

    # Token-aware-ish truncation from the front (keep newest)
    total = sum(len(m["content"]) for m in out)
    while total > char_budget and len(out) > 1:
        dropped = out.pop(0)
        total -= len(dropped["content"])
    return out


def memory_event_payload(
    *,
    history: list[dict[str, str]],
    conversation_summary: str | None = None,
) -> dict[str, Any]:
    return {
        "mapping_key": "live.status.memory",
        "source": "conversation",
        "history_turns": len(history),
        "has_summary": bool((conversation_summary or "").strip()),
    }
