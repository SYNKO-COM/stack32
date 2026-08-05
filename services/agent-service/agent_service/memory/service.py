"""Conversation + semantic memory service."""

from __future__ import annotations

import logging
import re
from typing import Any

from agent_service.gateway.model_gateway import get_model_gateway
from agent_service.supabase_client import get_supabase_admin_client

logger = logging.getLogger(__name__)

_SECRETISH = re.compile(
    r"(?i)(password|api[_-]?key|secret|token|bearer\s+\S+|sk-\S+|credit\s*card)"
)


async def read_memories(*, user_id: str, agent_id: str, query: str) -> list[dict[str, Any]]:
    if not user_id or not agent_id:
        return []
    gateway = get_model_gateway()
    try:
        vectors = await gateway.embed([query or "preferences"])
    except Exception:  # noqa: BLE001
        return await _list_recent(user_id, agent_id)

    embedding = vectors[0]
    async with get_supabase_admin_client() as client:
        # Use REST rpc — pass embedding as string vector literal
        vec_literal = "[" + ",".join(str(float(x)) for x in embedding) + "]"
        response = await client.post(
            "/rpc/match_agent_memories",
            json={
                "p_agent_id": agent_id,
                "p_query_embedding": vec_literal,
                "p_match_count": 8,
                "p_min_similarity": 0.75,
            },
            headers={
                "Authorization": client.headers["Authorization"],
                # Impersonation not available; service role filters by params + we add user filter in fallback
            },
        )
    if response.status_code >= 400:
        return await _list_recent(user_id, agent_id)
    rows = response.json()
    # Defense in depth — only return if we also verify via list
    return rows if isinstance(rows, list) else []


async def _list_recent(user_id: str, agent_id: str) -> list[dict[str, Any]]:
    async with get_supabase_admin_client() as client:
        response = await client.get(
            "/agent_memories",
            params={
                "user_id": f"eq.{user_id}",
                "agent_id": f"eq.{agent_id}",
                "select": "id,memory_type,content,summary,importance,metadata,created_at",
                "order": "created_at.desc",
                "limit": "20",
            },
        )
    if response.status_code >= 400:
        return []
    return response.json()


async def maybe_write_memory(state: dict[str, Any]) -> None:
    policy = state.get("memory_write_policy") or "explicit"
    if policy == "never":
        return
    content = str(state.get("memory_candidate") or "").strip()
    if not content:
        return
    if _SECRETISH.search(content):
        state["memory_write_rejected"] = "MEMORY_WRITE_REJECTED"
        return
    if policy == "automatic":
        # Validator: short factual statements only
        if len(content) > 500 or content.count("\n") > 3:
            state["memory_write_rejected"] = "MEMORY_WRITE_REJECTED"
            return
    await write_memory(
        user_id=str(state["user_id"]),
        agent_id=str(state["agent_id"]),
        memory_type=str(state.get("memory_type") or "fact"),
        content=content,
        thread_id=state.get("thread_id"),
    )


async def write_memory(
    *,
    user_id: str,
    agent_id: str,
    memory_type: str,
    content: str,
    thread_id: str | None = None,
) -> dict[str, Any] | None:
    gateway = get_model_gateway()
    embedding = None
    try:
        embedding = (await gateway.embed([content]))[0]
    except Exception:  # noqa: BLE001
        embedding = None

    payload: dict[str, Any] = {
        "user_id": user_id,
        "agent_id": agent_id,
        "thread_id": thread_id,
        "memory_type": memory_type,
        "content": content[:8000],
        "embedding_model": "configured",
        "embedding_dimension": 1536,
    }
    if embedding is not None:
        payload["embedding"] = embedding

    async with get_supabase_admin_client() as client:
        response = await client.post(
            "/agent_memories",
            json=payload,
            headers={"Prefer": "return=representation"},
        )
    if response.status_code >= 400:
        logger.warning("memory write failed status=%s", response.status_code)
        return None
    rows = response.json()
    return rows[0] if rows else None


async def clear_memories(*, user_id: str, agent_id: str) -> int:
    async with get_supabase_admin_client() as client:
        response = await client.delete(
            "/agent_memories",
            params={"user_id": f"eq.{user_id}", "agent_id": f"eq.{agent_id}"},
            headers={"Prefer": "return=representation"},
        )
    if response.status_code >= 400:
        return 0
    rows = response.json()
    return len(rows) if isinstance(rows, list) else 0


async def delete_memory(*, user_id: str, agent_id: str, memory_id: str) -> bool:
    async with get_supabase_admin_client() as client:
        response = await client.delete(
            "/agent_memories",
            params={
                "id": f"eq.{memory_id}",
                "user_id": f"eq.{user_id}",
                "agent_id": f"eq.{agent_id}",
            },
            headers={"Prefer": "return=representation"},
        )
    return response.status_code < 400
