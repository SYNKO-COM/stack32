"""Agent endpoints — reads, publish, graph."""

from __future__ import annotations

from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

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


@router.get("/{agent_id}/readiness")
async def get_agent_readiness(
    agent_id: UUID,
    user: CurrentUser,
    scope: str = "installation",
) -> dict[str, Any]:
    """Evaluate definition or installation readiness.

    scope=definition → portable template checks (publish/build)
    scope=installation → runtime setup for the caller's installation (default)
    """
    from agent_service.installations.service import InstallationService
    from agent_service.readiness import (
        evaluate_definition_readiness,
        evaluate_installation_readiness,
    )

    db = get_persistence()
    agent = await db.get_owned_agent(str(agent_id), user.user_id)
    if not agent:
        # Published consumer path for installation scope only.
        if scope != "installation":
            raise _not_found()
        rows = await db._select(
            "agents",
            {
                "id": f"eq.{agent_id}",
                "status": "eq.published",
                "deleted_at": "is.null",
                "select": "*",
                "limit": "1",
            },
        )
        agent = rows[0] if rows else None
    if not agent:
        raise _not_found()
    spec = await db.load_draft_spec(str(agent_id), user.user_id)
    if not spec and agent.get("published_version_id"):
        rows = await db._select(
            "agent_versions",
            {
                "id": f"eq.{agent['published_version_id']}",
                "select": "id,spec,graph_spec",
                "limit": "1",
            },
        )
        if rows:
            from agent_service.models.agent_spec import migrate_v1_to_v2

            raw = rows[0].get("spec") or {}
            if rows[0].get("graph_spec") and "graph" not in raw:
                raw = {**raw, "graph": rows[0]["graph_spec"]}
            try:
                spec = migrate_v1_to_v2(raw)
            except Exception:  # noqa: BLE001
                spec = None
    if not spec:
        raise HTTPException(
            status_code=400,
            detail={"code": "AGENT_SPEC_INVALID", "message": "Draft spec missing."},
        )

    model_cfg = getattr(spec, "model", None)
    if model_cfg is None or not getattr(model_cfg, "is_configured", False):
        from agent_service.models.agent_spec import AgentSpec
        from agent_service.security.user_secrets import latest_valid_model_config

        restored = await latest_valid_model_config(
            user_id=user.user_id, agent_id=str(agent_id)
        )
        if restored:
            data = spec.model_dump()
            data["model"] = restored
            spec = AgentSpec.model_validate(data)
            await db.persist_version(
                agent_id=str(agent_id),
                user_id=user.user_id,
                spec=spec,
                test_status="not_run",
                change_summary="Restore this user's saved model after a builder overwrite",
            )

    if scope == "definition":
        result = await evaluate_definition_readiness(
            agent_id=str(agent_id),
            user_id=user.user_id,
            spec=spec,
            db=db,
            build_ok=str(agent.get("status") or "")
            not in {"needs_attention", "building", "draft"},
        )
        return {
            "scope": "definition",
            "status": result.status,
            "checks": [
                {"key": c.key, "ok": c.ok, "message": c.message, "severity": c.severity}
                for c in result.checks
            ],
            "missing_connections": [],
            "missing_config": result.missing_config,
        }

    install = await InstallationService(db).get_or_create(
        user_id=user.user_id, agent_id=str(agent_id)
    )
    result = await evaluate_installation_readiness(
        agent_id=str(agent_id),
        user_id=user.user_id,
        spec=spec,
        db=db,
        installation_id=str(install["id"]),
    )
    return {
        "scope": "installation",
        "status": result.status,
        "installation_id": install["id"],
        "installation_status": install.get("status"),
        "checks": [
            {"key": c.key, "ok": c.ok, "message": c.message, "severity": c.severity}
            for c in result.checks
        ],
        "missing_connections": result.missing_connections,
        "missing_config": result.missing_config,
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
        code = result.get("code") or result.get("error") or "DEPLOYMENT_VALIDATION_FAILED"
        raise HTTPException(
            status_code=400,
            detail={"code": code, "message": "Publish validation failed."},
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
    memory = dict(data.get("memory") or {})
    previous_app = str(memory.get("external_app_id") or "").strip() or None
    for key in (
        "conversation_enabled",
        "semantic_enabled",
        "write_policy",
        "retention_days",
        "provider",
        "conversation_window",
        "external_app_id",
        "external_instructions",
    ):
        if key in body:
            memory[key] = body[key]

    provider = str(memory.get("provider") or "stack32")
    if provider == "external_postgres":
        app_id = str(memory.get("external_app_id") or "").strip() or None
        memory["conversation_enabled"] = False
        memory["semantic_enabled"] = False
        memory["write_policy"] = "never"
        if not app_id:
            memory["external_app_id"] = None
        instructions = memory.get("external_instructions")
        if isinstance(instructions, str):
            memory["external_instructions"] = instructions.strip()[:4000] or None
        data["memory"] = memory
        data = await _sync_external_memory_tools(
            data,
            previous_app_id=previous_app,
            new_app_id=app_id,
        )
    else:
        memory["provider"] = "stack32"
        memory["external_app_id"] = None
        memory["external_instructions"] = None
        data["memory"] = memory
        if previous_app:
            data = await _sync_external_memory_tools(
                data,
                previous_app_id=previous_app,
                new_app_id=None,
            )

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


class TriggerPatchItem(BaseModel):
    kind: str = Field(min_length=2, max_length=32)
    enabled: bool = True
    cron: str | None = Field(default=None, max_length=120)
    timezone: str | None = Field(default=None, max_length=64)


class TriggersPatchRequest(BaseModel):
    """Replace Chat/Schedule triggers on the draft spec and sync agent_schedules."""

    triggers: list[TriggerPatchItem] = Field(default_factory=list, max_length=20)
    schedule_hourly: bool | None = None
    cron: str | None = Field(default=None, max_length=120)
    timezone: str | None = Field(default=None, max_length=64)


@router.patch("/{agent_id}/triggers")
async def patch_triggers(
    agent_id: UUID, user: CurrentUser, body: TriggersPatchRequest
) -> dict[str, Any]:
    from agent_service.models.agent_spec import AgentSpec, normalize_triggers

    db: Persistence = get_persistence()
    spec = await db.load_draft_spec(str(agent_id), user.user_id)
    if not spec:
        raise HTTPException(
            status_code=400, detail={"code": "AGENT_SPEC_INVALID", "message": "No draft spec."}
        )

    default_cron = (body.cron or "0 9 * * 1,2,3,4,5").strip()[:120]
    default_tz = (body.timezone or "UTC").strip()[:64] or "UTC"

    raw_triggers: list[dict[str, Any]]
    if body.schedule_hourly is not None and not body.triggers:
        raw_triggers = [{"kind": "chat", "enabled": True, "cron": None, "timezone": None}]
        if body.schedule_hourly:
            # Preserve existing schedule timing when re-enabling without explicit triggers.
            prior = next(
                (t for t in (spec.triggers or []) if t.kind == "schedule"),
                None,
            )
            cron = (prior.cron if prior and prior.cron else default_cron)[:120]
            timezone = (prior.timezone if prior and prior.timezone else default_tz)[:64]
            # Legacy every-hour cron is incomplete for days+time UI — replace with default.
            hour_field = cron.split()[1] if len(cron.split()) == 5 else "*"
            if hour_field == "*":
                cron = default_cron
                timezone = default_tz
            raw_triggers.append(
                {
                    "kind": "schedule",
                    "enabled": True,
                    "cron": cron,
                    "timezone": timezone,
                }
            )
    else:
        raw_triggers = [item.model_dump() for item in body.triggers]

    # Always keep Chat on the MVP surface.
    if not any(str(t.get("kind") or "").lower() == "chat" for t in raw_triggers):
        raw_triggers.insert(
            0, {"kind": "chat", "enabled": True, "cron": None, "timezone": None}
        )

    normalized = normalize_triggers(raw_triggers)
    data = spec.model_dump()
    data["triggers"] = normalized
    updated = AgentSpec.model_validate(data)

    schedule = next((t for t in updated.triggers if t.kind == "schedule" and t.enabled), None)
    await _sync_schedule_rows(
        user_id=user.user_id,
        agent_id=str(agent_id),
        schedule=schedule,
    )

    version = await db.persist_version(
        agent_id=str(agent_id),
        user_id=user.user_id,
        spec=updated,
        test_status="not_run",
        change_summary="Triggers updated",
    )
    return {
        "version_id": version.get("id"),
        "triggers": [t.model_dump() for t in updated.triggers],
    }


async def _sync_schedule_rows(
    *,
    user_id: str,
    agent_id: str,
    schedule: Any | None,
) -> None:
    """Create/enable or disable agent_schedules to match the schedule trigger."""
    from datetime import UTC, datetime

    from agent_service.scheduling.cron import CronError, compute_next_run
    from agent_service.supabase_client import get_supabase_admin_client

    async with get_supabase_admin_client() as client:
        existing = await client.get(
            "/agent_schedules",
            params={
                "agent_id": f"eq.{agent_id}",
                "user_id": f"eq.{user_id}",
                "select": "id,enabled,cron_expression,timezone",
                "order": "created_at.desc",
            },
        )
        rows = existing.json() if existing.status_code < 400 else []
        if not isinstance(rows, list):
            rows = []

        if schedule is None:
            for row in rows:
                if row.get("enabled"):
                    await client.patch(
                        "/agent_schedules",
                        params={"id": f"eq.{row['id']}"},
                        json={"enabled": False},
                    )
            return

        cron = str(schedule.cron or "0 9 * * 1,2,3,4,5")[:120]
        timezone = str(schedule.timezone or "UTC")[:64]
        next_run_at: str | None = None
        try:
            next_run_at = compute_next_run(cron, timezone, datetime.now(UTC)).isoformat()
        except CronError:
            next_run_at = None

        payload = {
            "enabled": True,
            "cron_expression": cron,
            "timezone": timezone,
            "config": {"source": "structure_triggers", "trigger_chat": True},
            **({"next_run_at": next_run_at} if next_run_at else {}),
        }
        if rows:
            primary = rows[0]
            await client.patch(
                "/agent_schedules",
                params={"id": f"eq.{primary['id']}"},
                json=payload,
            )
            for row in rows[1:]:
                if row.get("enabled"):
                    await client.patch(
                        "/agent_schedules",
                        params={"id": f"eq.{row['id']}"},
                        json={"enabled": False},
                    )
            return

        await client.post(
            "/agent_schedules",
            json={
                "user_id": user_id,
                "agent_id": agent_id,
                "cron_expression": cron,
                "timezone": timezone,
                "enabled": True,
                "config": {"source": "structure_triggers", "trigger_chat": True},
                **({"next_run_at": next_run_at} if next_run_at else {}),
            },
        )


async def _sync_external_memory_tools(
    data: dict[str, Any],
    *,
    previous_app_id: str | None,
    new_app_id: str | None,
) -> dict[str, Any]:
    """Bind Pipedream DB tools + connection requirement for external memory."""
    from agent_service.builder.capabilities import (
        _app_slug_from_tool_id,
        build_connection_requirements,
        resolve_pipedream_app,
    )
    from agent_service.integrations.registry import get_provider_registry
    from agent_service.models.agent_spec import ToolBinding

    def _norm(value: str | None) -> str:
        return (value or "").strip().lower().replace("-", "_")

    prev = _norm(previous_app_id)
    nxt = _norm(new_app_id)

    tools_raw = list(data.get("tools") or [])
    bindings: list[ToolBinding] = []
    for item in tools_raw:
        try:
            bindings.append(
                item if isinstance(item, ToolBinding) else ToolBinding.model_validate(item)
            )
        except Exception:  # noqa: BLE001
            continue

    def _belongs(binding: ToolBinding, app: str) -> bool:
        if not app:
            return False
        bid_app = _norm(binding.app_id) or _norm(_app_slug_from_tool_id(binding.tool_id))
        return bid_app == app or _norm(binding.tool_id).startswith(f"pd:{app}-")

    # Drop tools that belonged only to the previous external memory app.
    if prev and prev != nxt:
        bindings = [b for b in bindings if not _belongs(b, prev)]

    if nxt:
        seen = {b.tool_id for b in bindings}
        selected: list[ToolBinding] = list(bindings)

        def add_binding(binding: ToolBinding) -> None:
            if binding.tool_id in seen:
                return
            seen.add(binding.tool_id)
            selected.append(binding)

        reg = get_provider_registry()
        search = getattr(reg, "search", None) or reg.search_tools
        try:
            await resolve_pipedream_app(
                app_query=nxt,
                prompt=f"{nxt} database query select insert update read write memory",
                registry=reg,
                search=search,
                add_binding=add_binding,
                ambiguous=[],
                max_actions=3,
            )
        except Exception:  # noqa: BLE001
            # Connection requirement below still lets the user Connect; tools can JIT later.
            pass
        bindings = selected

    # Rebuild connection requirements from the full tool set.
    data["tools"] = [b.model_dump() for b in bindings]
    try:
        reqs = await build_connection_requirements(bindings)
        data["connection_requirements"] = [r.model_dump() for r in reqs]
    except Exception:  # noqa: BLE001
        # Fallback: ensure at least the chosen memory app is required.
        if nxt:
            reqs = list(data.get("connection_requirements") or [])
            key = f"pipedream:{nxt}"
            if not any(
                str(r.get("provider") or "").lower() == "pipedream"
                and _norm(str(r.get("app_id") or "")) == nxt
                for r in reqs
                if isinstance(r, dict)
            ):
                reqs.append(
                    {
                        "provider": "pipedream",
                        "app_id": nxt,
                        "auth_type": "oauth2",
                        "tool_ids": [],
                        "required_for": [],
                        "required": True,
                    }
                )
            data["connection_requirements"] = reqs
        elif prev:
            reqs = [
                r
                for r in (data.get("connection_requirements") or [])
                if not (
                    isinstance(r, dict)
                    and str(r.get("provider") or "").lower() == "pipedream"
                    and _norm(str(r.get("app_id") or "")) == prev
                )
            ]
            data["connection_requirements"] = reqs
    return data

class ModelPatchRequest(BaseModel):
    provider: str = Field(min_length=2, max_length=32)
    model_id: str = Field(min_length=1, max_length=200)


@router.patch("/{agent_id}/model")
async def patch_model(
    agent_id: UUID, user: CurrentUser, body: ModelPatchRequest
) -> dict[str, Any]:
    db: Persistence = get_persistence()
    spec = await db.load_draft_spec(str(agent_id), user.user_id)
    if not spec:
        raise HTTPException(
            status_code=400, detail={"code": "AGENT_SPEC_INVALID", "message": "No draft spec."}
        )
    data = spec.model_dump()
    model = dict(data.get("model") or {})
    model["provider"] = body.provider.lower().strip()
    model["model_id"] = body.model_id.strip()
    model["credential_scope"] = "agent"
    model["fallback_enabled"] = False
    data["model"] = model
    from agent_service.models.agent_spec import AgentSpec

    updated = AgentSpec.model_validate(data)
    version = await db.persist_version(
        agent_id=str(agent_id),
        user_id=user.user_id,
        spec=updated,
        test_status="not_run",
        change_summary="Model updated",
    )
    return {
        "version_id": version.get("id"),
        "model": updated.model.model_dump() if updated.model else None,
    }


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
