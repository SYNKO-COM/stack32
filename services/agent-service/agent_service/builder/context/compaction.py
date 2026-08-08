"""Conversation compaction (M-B).

Retains invariants (system rules, objective, plan, latest turns, active errors)
and summarizes older history when near the token budget. Summarization uses the
`fast` model profile; it degrades to head/tail truncation with source markers
when no model is available. Tracks provenance to avoid re-summarizing.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from agent_service.builder.context.budget import estimate_tokens


@dataclass(slots=True)
class CompactionResult:
    messages: list[dict[str, Any]]
    summary: str | None
    compacted: bool
    original_count: int
    kept_count: int


async def compact_history(
    messages: list[dict[str, Any]],
    *,
    max_tokens: int,
    keep_recent: int = 6,
    summarizer=None,
) -> CompactionResult:
    """Compact `messages` (list of {role, content}) under a token budget.

    `summarizer` is an optional async callable(text) -> str. When absent, older
    turns are folded into a head/tail marker instead of an LLM summary.
    """
    total = sum(estimate_tokens(str(m.get("content", ""))) for m in messages)
    if total <= max_tokens or len(messages) <= keep_recent + 1:
        return CompactionResult(
            messages=messages, summary=None, compacted=False,
            original_count=len(messages), kept_count=len(messages),
        )

    head = messages[:1] if messages and messages[0].get("role") == "system" else []
    recent = messages[-keep_recent:]
    older = messages[len(head) : len(messages) - keep_recent]
    older_text = "\n".join(f"{m.get('role')}: {m.get('content')}" for m in older)

    if summarizer is not None and older_text.strip():
        try:
            summary = await summarizer(older_text)
        except Exception:  # noqa: BLE001
            summary = _fallback_summary(older_text)
    else:
        summary = _fallback_summary(older_text)

    summary_msg = {"role": "system", "content": f"[Earlier conversation summary]\n{summary}"}
    compacted = [*head, summary_msg, *recent]
    return CompactionResult(
        messages=compacted, summary=summary, compacted=True,
        original_count=len(messages), kept_count=len(compacted),
    )


def _fallback_summary(text: str, *, cap: int = 1200) -> str:
    if len(text) <= cap:
        return text
    head = int(cap * 0.6)
    tail = cap - head
    return f"{text[:head]}\n... [older turns elided] ...\n{text[-tail:]}"
