"""Agent endpoints — reads, publish, graph."""

from __future__ import annotations

from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from agent_service.auth import CurrentUser
from agent_service.publishing.service import PublishService
from agent_service.supabase_client import (
    Persistence,
    SupabaseRepository,
    get_persistence,
    get_repository,
)

router = APIRouter(prefix="/agents", tags=["agents"])

Repo = Annotated[SupabaseRepository, Depends(get_repository)]


def _not_found() -> HTTPException:
    return HTTPException(
        status_code=404,
        detail={"code": "not_found", "message": "Agent not found."},
    )


@router.get("/{agent_id}")
async def get_agent(agent_id: str, user: CurrentUser, repo: Repo) -> dict[str, Any]:
    agent = await repo.get_owned_agent(agent_id, user.user_id)
    if agent is None:
        raise _not_found()
    return agent


@router.get("/{agent_id}/versions")
async def list_agent_versions(
    agent_id: str, user: CurrentUser, repo: Repo
) -> list[dict[str, Any]]:
    agent = await repo.get_owned_agent(agent_id, user.user_id)
    if agent is None:
        raise _not_found()
    return await repo.list_agent_versions(agent_id)


@router.get("/{agent_id}/graph")
async def get_graph(agent_id: UUID, user: CurrentUser) -> dict[str, Any]:
    db = get_persistence()
    agent = await db.get_owned_agent(str(agent_id), user.user_id)
    if not agent:
        raise _not_found()
    spec = await db.load_draft_spec(str(agent_id), user.user_id)
    if not spec:
        return {"graph": None, "schema_version": None}
    return {
        "graph": spec.graph.model_dump(),
        "schema_version": spec.schema_version,
        "identity": spec.identity.model_dump(),
        "test_ready": True,
    }


@router.get("/{agent_id}/versions/{version_id}/graph")
async def get_version_graph(
    agent_id: UUID, version_id: UUID, user: CurrentUser
) -> dict[str, Any]:
    db = get_persistence()
    agent = await db.get_owned_agent(str(agent_id), user.user_id)
    if not agent:
        raise _not_found()
    rows = await db._select(
        "agent_versions",
        {
            "id": f"eq.{version_id}",
            "agent_id": f"eq.{agent_id}",
            "select": "id,spec,graph_spec,schema_compat",
            "limit": "1",
        },
    )
    if not rows:
        raise _not_found()
    from agent_service.models.agent_spec import migrate_v1_to_v2

    raw = rows[0].get("spec") or {}
    if rows[0].get("graph_spec") and "graph" not in raw:
        raw = {**raw, "graph": rows[0]["graph_spec"]}
    spec = migrate_v1_to_v2(raw)
    return {"graph": spec.graph.model_dump(), "version_id": str(version_id)}


@router.post("/{agent_id}/publish")
async def publish_agent(agent_id: UUID, user: CurrentUser) -> dict[str, Any]:
    result = await PublishService().publish(user_id=user.user_id, agent_id=str(agent_id))
    if result.get("error") == "forbidden":
        raise _not_found()
    if result.get("error"):
        raise HTTPException(
            status_code=400,
            detail={"code": result["error"], "message": "Publish validation failed."},
        )
    return result


@router.post("/{agent_id}/unpublish")
async def unpublish_agent(agent_id: UUID, user: CurrentUser) -> dict[str, Any]:
    result = await PublishService().unpublish(user_id=user.user_id, agent_id=str(agent_id))
    if result.get("error") == "forbidden":
        raise _not_found()
    return result


@router.get("/{agent_id}/deployment")
async def get_deployment(agent_id: UUID, user: CurrentUser) -> dict[str, Any]:
    deployment = await PublishService().get_deployment(
        user_id=user.user_id, agent_id=str(agent_id)
    )
    return {"deployment": deployment}


@router.get("/{agent_id}/memories")
async def list_memories(agent_id: UUID, user: CurrentUser) -> dict[str, Any]:
    from agent_service.memory.service import _list_recent

    agent = await get_persistence().get_owned_agent(str(agent_id), user.user_id)
    if not agent:
        raise _not_found()
    memories = await _list_recent(user.user_id, str(agent_id))
    return {"memories": memories}


@router.delete("/{agent_id}/memories/{memory_id}")
async def delete_memory(agent_id: UUID, memory_id: UUID, user: CurrentUser) -> dict[str, Any]:
    from agent_service.memory.service import delete_memory as _delete

    ok = await _delete(user_id=user.user_id, agent_id=str(agent_id), memory_id=str(memory_id))
    await get_persistence().audit(
        user_id=user.user_id,
        agent_id=str(agent_id),
        action="memory_delete",
        resource_type="memory",
        resource_id=str(memory_id),
        result="success" if ok else "failure",
    )
    return {"deleted": ok}


@router.delete("/{agent_id}/memories")
async def clear_memories(agent_id: UUID, user: CurrentUser) -> dict[str, Any]:
    from agent_service.memory.service import clear_memories as _clear

    count = await _clear(user_id=user.user_id, agent_id=str(agent_id))
    await get_persistence().audit(
        user_id=user.user_id,
        agent_id=str(agent_id),
        action="memory_clear",
        resource_type="agent",
        resource_id=str(agent_id),
        result="success",
        risk_level="medium",
    )
    return {"deleted": count}


@router.patch("/{agent_id}/memory-settings")
async def patch_memory_settings(
    agent_id: UUID, user: CurrentUser, body: dict[str, Any]
) -> dict[str, Any]:
    db: Persistence = get_persistence()
    spec = await db.load_draft_spec(str(agent_id), user.user_id)
    if not spec:
        raise HTTPException(
            status_code=400, detail={"code": "AGENT_SPEC_INVALID", "message": "No draft spec."}
        )
    data = spec.model_dump()
    memory = data.get("memory") or {}
    for key in ("conversation_enabled", "semantic_enabled", "write_policy", "retention_days"):
        if key in body:
            memory[key] = body[key]
    data["memory"] = memory
    from agent_service.models.agent_spec import AgentSpec

    updated = AgentSpec.model_validate(data)
    version = await db.persist_version(
        agent_id=str(agent_id),
        user_id=user.user_id,
        spec=updated,
        test_status="not_run",
        change_summary="Memory settings updated",
    )
    return {"version_id": version.get("id"), "memory": updated.memory.model_dump()}


@router.get("/{agent_id}/project/files")
async def list_project_files(agent_id: UUID, user: CurrentUser) -> dict[str, Any]:
    db = get_persistence()
    agent = await db.get_owned_agent(str(agent_id), user.user_id)
    if not agent:
        raise _not_found()
    from agent_service.builder.project_files import list_project_files as _list

    files = await _list(user_id=user.user_id, agent_id=str(agent_id))
    return {"files": files}


@router.get("/{agent_id}/project/files/{path:path}")
async def get_project_file(agent_id: UUID, path: str, user: CurrentUser) -> dict[str, Any]:
    db = get_persistence()
    agent = await db.get_owned_agent(str(agent_id), user.user_id)
    if not agent:
        raise _not_found()
    from agent_service.builder.project_files import get_project_file as _get

    row = await _get(user_id=user.user_id, agent_id=str(agent_id), path=path)
    if not row:
        raise _not_found()
    return {"file": row}


@router.get("/{agent_id}/snapshots")
async def list_agent_snapshots(agent_id: UUID, user: CurrentUser) -> dict[str, Any]:
    db = get_persistence()
    agent = await db.get_owned_agent(str(agent_id), user.user_id)
    if not agent:
        raise _not_found()
    from agent_service.builder.projects import list_snapshots

    snapshots = await list_snapshots(user_id=user.user_id, agent_id=str(agent_id))
    return {"snapshots": snapshots}


@router.get("/{agent_id}/project/structure")
async def get_project_structure(agent_id: UUID, user: CurrentUser) -> dict[str, Any]:
    """Executable structure derived from the latest snapshot's real code."""
    db = get_persistence()
    agent = await db.get_owned_agent(str(agent_id), user.user_id)
    if not agent:
        raise _not_found()
    from agent_service.builder.projects import get_snapshot_files, list_snapshots
    from agent_service.builder.structure import derive_structure
    from agent_service.connections.manager import ConnectionManager

    snapshots = await list_snapshots(user_id=user.user_id, agent_id=str(agent_id))
    if not snapshots:
        return {"structure": None, "source": "project", "snapshot_id": None}
    latest = snapshots[0]
    files = await get_snapshot_files(user_id=user.user_id, snapshot_id=latest["id"])
    bindings = await ConnectionManager().list_bindings(
        user_id=user.user_id, agent_id=str(agent_id)
    )
    structure = derive_structure(latest.get("manifest"), files, bindings=bindings)
    return {"structure": structure, "snapshot_id": latest["id"]}


@router.get("/{agent_id}/snapshots/{snapshot_id}/files/{path:path}")
async def get_snapshot_file(
    agent_id: UUID, snapshot_id: UUID, path: str, user: CurrentUser
) -> dict[str, Any]:
    """Open file / View code — return one file's source from an immutable snapshot."""
    db = get_persistence()
    agent = await db.get_owned_agent(str(agent_id), user.user_id)
    if not agent:
        raise _not_found()
    from agent_service.builder.projects import get_snapshot_files

    files = await get_snapshot_files(user_id=user.user_id, snapshot_id=str(snapshot_id))
    match = next((f for f in files if f.get("path") == path), None)
    if not match:
        raise _not_found()
    return {"file": match}
