"""Installation endpoints — get_or_create, readiness, ownership."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import APIRouter, HTTPException

from agent_service.auth import CurrentUser
from agent_service.installations.service import InstallationError, InstallationService
from agent_service.supabase_client import get_persistence

router = APIRouter(prefix="/installations", tags=["installations"])


def _not_found() -> HTTPException:
    return HTTPException(
        status_code=404,
        detail={"code": "not_found", "message": "Installation not found."},
    )


@router.post("/get-or-create")
async def get_or_create(body: dict[str, Any], user: CurrentUser) -> dict[str, Any]:
    agent_id = str(body.get("agent_id") or "").strip()
    if not agent_id:
        raise HTTPException(
            status_code=400,
            detail={"code": "invalid_request", "message": "agent_id required."},
        )
    try:
        install = await InstallationService().get_or_create(
            user_id=user.user_id,
            agent_id=agent_id,
            pinned_version_id=body.get("pinned_version_id"),
        )
    except InstallationError as exc:
        raise HTTPException(
            status_code=403 if exc.code.endswith("FORBIDDEN") or "NOT_INSTALLABLE" in exc.code else 400,
            detail={"code": exc.code, "message": str(exc)},
        ) from exc
    return install


@router.get("/{installation_id}")
async def get_installation(installation_id: UUID, user: CurrentUser) -> dict[str, Any]:
    row = await InstallationService().get_installation(
        installation_id=str(installation_id), user_id=user.user_id
    )
    if not row:
        raise _not_found()
    return row


@router.get("/{installation_id}/readiness")
async def installation_readiness(installation_id: UUID, user: CurrentUser) -> dict[str, Any]:
    from agent_service.readiness import evaluate_installation_readiness

    svc = InstallationService()
    install = await svc.get_installation(
        installation_id=str(installation_id), user_id=user.user_id
    )
    if not install:
        raise _not_found()
    agent_id = str(install["agent_id"])
    db = get_persistence()
    # Prefer pinned/published version for consumers; draft for owners.
    spec = await db.load_draft_spec(agent_id, user.user_id)
    if not spec and install.get("pinned_version_id"):
        rows = await db._select(
            "agent_versions",
            {
                "id": f"eq.{install['pinned_version_id']}",
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
            detail={"code": "AGENT_SPEC_INVALID", "message": "Spec missing."},
        )
    result = await evaluate_installation_readiness(
        agent_id=agent_id,
        user_id=user.user_id,
        spec=spec,
        db=db,
        installation_id=str(installation_id),
    )
    # Persist installation status from evaluation.
    mapped = {
        "ready": "ready",
        "needs_setup": "setup_required",
        "needs_attention": "needs_attention",
    }.get(result.status, "setup_required")
    await svc.update_status(
        installation_id=str(installation_id),
        user_id=user.user_id,
        status=mapped,  # type: ignore[arg-type]
    )
    return {
        "status": result.status,
        "installation_status": mapped,
        "checks": [
            {"key": c.key, "ok": c.ok, "message": c.message, "severity": c.severity}
            for c in result.checks
        ],
        "missing_connections": result.missing_connections,
        "missing_config": result.missing_config,
        "installation_id": str(installation_id),
        "agent_id": agent_id,
    }
