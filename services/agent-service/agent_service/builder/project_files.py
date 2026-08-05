"""Virtual project files derived from a validated AgentSpec."""

from __future__ import annotations

import hashlib
import json
from typing import Any

from agent_service.models.agent_spec import AgentSpec
from agent_service.supabase_client import get_supabase_admin_client


def build_project_artifacts(spec: AgentSpec) -> list[dict[str, str]]:
    """Return [{path, content, content_type}, ...] for agent.json / graph.json / tools.json."""
    agent_json = {
        "schema_version": spec.schema_version,
        "identity": spec.identity.model_dump(),
        "goal": spec.goal,
        "instructions": spec.instructions.model_dump(),
        "model_policy": spec.model_policy.model_dump(),
        "knowledge": spec.knowledge.model_dump(),
        "memory": spec.memory.model_dump(),
        "rules": [r.model_dump() for r in spec.rules],
        "starter_prompts": list(spec.starter_prompts),
        "runtime": spec.runtime.model_dump(),
        "security": spec.security.model_dump(),
    }
    tools_json = {"tools": [t.model_dump() for t in spec.tools]}
    graph_json = spec.graph.model_dump()
    return [
        {
            "path": "agent.json",
            "content": json.dumps(agent_json, indent=2, ensure_ascii=False),
            "content_type": "application/json",
        },
        {
            "path": "graph.json",
            "content": json.dumps(graph_json, indent=2, ensure_ascii=False),
            "content_type": "application/json",
        },
        {
            "path": "tools.json",
            "content": json.dumps(tools_json, indent=2, ensure_ascii=False),
            "content_type": "application/json",
        },
    ]


async def upsert_project_files(
    *,
    user_id: str,
    agent_id: str,
    version_id: str | None,
    spec: AgentSpec,
) -> list[dict[str, Any]]:
    artifacts = build_project_artifacts(spec)
    saved: list[dict[str, Any]] = []
    async with get_supabase_admin_client() as client:
        for art in artifacts:
            checksum = hashlib.sha256(art["content"].encode("utf-8")).hexdigest()
            # Delete existing path then insert (simple upsert)
            await client.delete(
                "/agent_project_files",
                params={
                    "user_id": f"eq.{user_id}",
                    "agent_id": f"eq.{agent_id}",
                    "path": f"eq.{art['path']}",
                },
            )
            response = await client.post(
                "/agent_project_files",
                json={
                    "user_id": user_id,
                    "agent_id": agent_id,
                    "version_id": version_id,
                    "path": art["path"],
                    "content": art["content"],
                    "content_type": art["content_type"],
                    "checksum": checksum,
                },
                headers={"Prefer": "return=representation"},
            )
            if response.status_code < 400:
                rows = response.json()
                if isinstance(rows, list) and rows:
                    saved.append(rows[0])
    return saved


async def list_project_files(*, user_id: str, agent_id: str) -> list[dict[str, Any]]:
    async with get_supabase_admin_client() as client:
        response = await client.get(
            "/agent_project_files",
            params={
                "user_id": f"eq.{user_id}",
                "agent_id": f"eq.{agent_id}",
                "select": "id,path,content_type,checksum,version_id,updated_at,created_at",
                "order": "path.asc",
            },
        )
    if response.status_code >= 400:
        return []
    rows = response.json()
    return rows if isinstance(rows, list) else []


async def get_project_file(
    *, user_id: str, agent_id: str, path: str
) -> dict[str, Any] | None:
    async with get_supabase_admin_client() as client:
        response = await client.get(
            "/agent_project_files",
            params={
                "user_id": f"eq.{user_id}",
                "agent_id": f"eq.{agent_id}",
                "path": f"eq.{path}",
                "select": "*",
                "limit": "1",
            },
        )
    if response.status_code >= 400:
        return None
    rows = response.json()
    return rows[0] if isinstance(rows, list) and rows else None
