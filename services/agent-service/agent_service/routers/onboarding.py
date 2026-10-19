"""Dispatch only persisted, owned onboarding jobs; client input cannot forge runs."""
from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, HTTPException

from agent_service.auth import CurrentUser
from agent_service.queue.dispatch import dispatch_run
from agent_service.routers.builder import _guards
from agent_service.supabase_client import get_persistence, get_supabase_admin_client

router = APIRouter(tags=["onboarding"])


@router.post("/onboarding/dispatch")
async def dispatch_onboarding(user: CurrentUser) -> dict[str, Any]:
    db = get_persistence()
    rows = await db._select("onboarding_projects", {
        "user_id": f"eq.{user.user_id}", "select": "*", "limit": "1",
    })
    if not rows:
        raise HTTPException(status_code=404, detail="draft_missing")
    project = rows[0]
    launching = project["status"] == "launched"
    run_id = project.get("launch_run_id" if launching else "preparation_run_id")
    if not run_id:
        return {"status": project["status"]}
    run = await db.get_owned_run(str(run_id), user.user_id)
    # A killed worker may leave a running preparation behind. Its fenced lease
    # makes reclaim safe, while an active worker must never be duplicated.
    expired_preparation = False
    if run and not launching and run["status"] == "running":
        lease = project.get("lease_until")
        expired_preparation = not lease or datetime.fromisoformat(str(lease).replace("Z", "+00:00")) <= datetime.now(UTC)
    if not run or (run["status"] != "queued" and not expired_preparation):
        return {"status": (run or {}).get("status", project["status"])}
    await _guards(user.user_id)
    from agent_service.queue.worker import process_run_by_id
    return await dispatch_run(db=db, run_id=str(run_id), user_id=user.user_id,
                              execute=lambda: process_run_by_id(str(run_id)))


@router.post("/onboarding/resume")
async def resume_onboarding(user: CurrentUser) -> dict[str, Any]:
    db = get_persistence()
    projects = await db._select("onboarding_projects", {
        "user_id": f"eq.{user.user_id}", "status": "eq.launched", "select": "launch_run_id", "limit": "1",
    })
    if not projects or not projects[0].get("launch_run_id"):
        return {"status": "not_applicable"}
    run_id = str(projects[0]["launch_run_id"])
    run = await db.get_owned_run(run_id, user.user_id)
    if not run:
        return {"status": "not_applicable"}
    if run["status"] == "failed" and run.get("error_code") == "LLM_CONFIGURATION_REQUIRED":
        async with get_supabase_admin_client() as client:
            result = await client.patch("/runs", params={"id": f"eq.{run_id}", "user_id": f"eq.{user.user_id}", "status": "eq.failed", "error_code": "eq.LLM_CONFIGURATION_REQUIRED"},
                                        json={"status": "queued", "error_code": None, "completed_at": None})
            result.raise_for_status()
        return await dispatch_onboarding(user)
    if run["status"] == "running" and run.get("error_code") == "BUILDER_INTERRUPTED":
        from agent_service.runtime.approvals import list_pending_approvals
        if await list_pending_approvals(user_id=user.user_id, run_id=run_id):
            return {"status": "waiting_for_approval"}
        await _guards(user.user_id)
        from agent_service.queue.worker import process_run_by_id
        return await dispatch_run(db=db, run_id=run_id, user_id=user.user_id,
                                  execute=lambda: process_run_by_id(run_id))
    return {"status": run["status"]}
