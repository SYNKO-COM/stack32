"""Knowledge retrieval (RAG)."""

from __future__ import annotations

from typing import Any

from agent_service.gateway.model_gateway import get_model_gateway
from agent_service.supabase_client import get_supabase_admin_client


async def retrieve_knowledge(
    *,
    user_id: str,
    agent_id: str,
    query: str,
    max_chunks: int = 8,
    min_similarity: float = 0.7,
) -> list[dict[str, Any]]:
    if not user_id or not agent_id or not query.strip():
        return []

    gateway = get_model_gateway()
    try:
        embedding = (await gateway.embed([query]))[0]
    except Exception:  # noqa: BLE001
        return await _keyword_fallback(user_id, agent_id, query, max_chunks)

    vec_literal = "[" + ",".join(str(float(x)) for x in embedding) + "]"
    async with get_supabase_admin_client() as client:
        response = await client.post(
            "/rpc/match_knowledge_chunks",
            json={
                "p_agent_id": agent_id,
                "p_query_embedding": vec_literal,
                "p_match_count": max_chunks,
                "p_min_similarity": min_similarity,
            },
        )
    if response.status_code >= 400:
        return await _keyword_fallback(user_id, agent_id, query, max_chunks)
    rows = response.json()
    # Enforce user isolation in case RPC was called with service role
    filtered = []
    async with get_supabase_admin_client() as client:
        owned = await client.get(
            "/knowledge_chunks",
            params={
                "user_id": f"eq.{user_id}",
                "agent_id": f"eq.{agent_id}",
                "select": "id",
                "limit": "500",
            },
        )
    owned_ids = {r["id"] for r in (owned.json() if owned.status_code < 400 else [])}
    for row in rows if isinstance(rows, list) else []:
        if row.get("id") in owned_ids:
            filtered.append(row)
    return filtered


async def _keyword_fallback(
    user_id: str, agent_id: str, query: str, max_chunks: int
) -> list[dict[str, Any]]:
    async with get_supabase_admin_client() as client:
        response = await client.get(
            "/knowledge_chunks",
            params={
                "user_id": f"eq.{user_id}",
                "agent_id": f"eq.{agent_id}",
                "content": f"ilike.*{query[:80]}*",
                "select": "id,source_id,content,metadata",
                "limit": str(max_chunks),
            },
        )
    if response.status_code >= 400:
        return []
    return response.json()
