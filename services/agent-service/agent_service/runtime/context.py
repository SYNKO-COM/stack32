"""Conversation context for generated-agent Live runs."""

from __future__ import annotations

from agent_service.supabase_client import Persistence

# Rough char budget ≈ tokens * 4 for truncation without a tokenizer dependency.
_DEFAULT_CHAR_BUDGET = 24_000


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
            "limit": str(max(1, window)),
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

    # Token-aware-ish truncation from the front (keep newest)
    total = sum(len(m["content"]) for m in out)
    while total > char_budget and len(out) > 1:
        dropped = out.pop(0)
        total -= len(dropped["content"])
    return out
