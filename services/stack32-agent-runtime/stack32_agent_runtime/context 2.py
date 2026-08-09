"""Context assembly for generated agents.

Deterministic assembly of the model context from typed sections. Keeps ordering
and truncation predictable (system -> objective -> memory -> recent turns).
"""

from __future__ import annotations

from stack32_agent_runtime.state import AgentState, Message

_CHARS_PER_TOKEN = 4


def estimate_tokens(text: str) -> int:
    return max(1, len(text) // _CHARS_PER_TOKEN)


def build_messages(
    state: AgentState,
    *,
    system_prompt: str,
    memory_snippets: list[str] | None = None,
    max_recent: int = 20,
) -> list[Message]:
    messages: list[Message] = [Message(role="system", content=system_prompt)]
    if memory_snippets:
        joined = "\n".join(f"- {s}" for s in memory_snippets[:8])
        messages.append(Message(role="system", content=f"Relevant memory:\n{joined}"))
    messages.append(Message(role="user", content=state.objective))
    messages.extend(state.messages[-max_recent:])
    return messages
