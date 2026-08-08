"""Persistence for immutable agent projects + snapshots (M-F).

Writes go through the service role. Every successful build creates an immutable
snapshot; files are versioned by snapshot_id (no destructive per-path upsert).
All methods degrade gracefully when Supabase is unavailable so local demos and
tests still run.
"""

from __future__ import annotations

import hashlib
import logging
from datetime import UTC, datetime
from typing import Any

from agent_service.supabase_client import get_supabase_admin_client

logger = logging.getLogger(__name__)


async def ensure_project(
    *, user_id: str, agent_id: str, runtime_version: str, pattern: str | None
) -> dict[str, Any] | None:
    try:
        async with get_supabase_admin_client() as client:
            existing = await client.get(
                "/agent_projects",
                params={"agent_id": f"eq.{agent_id}", "user_id": f"eq.{user_id}", "select": "*", "limit": "1"},
            )
            if existing.status_code < 400 and existing.json():
                row = existing.json()[0]
                await client.patch(
                    "/agent_projects",
                    params={"id": f"eq.{row['id']}"},
                    json={"runtime_version": runtime_version, "pattern": pattern, "updated_at": datetime.now(UTC).isoformat()},
                )
                return row
            resp = await client.post(
                "/agent_projects",
                json={
                    "user_id": user_id,
                    "agent_id": agent_id,
                    "runtime_version": runtime_version,
                    "pattern": pattern,
                },
                headers={"Prefer": "return=representation"},
            )
            if resp.status_code < 400 and resp.json():
                return resp.json()[0]
    except Exception:  # noqa: BLE001
        logger.debug("ensure_project skipped (db unavailable)")
    return None


async def create_snapshot(
    *,
    user_id: str,
    agent_id: str,
    project_id: str,
    version_id: str | None,
    sandbox_snapshot_id: str | None,
    manifest: dict[str, Any],
    test_status: str,
    lint_status: str,
    files: list[dict[str, str]],
) -> dict[str, Any] | None:
    checksum = hashlib.sha256(
        "".join(sorted(f"{f['path']}:{f['content']}" for f in files)).encode("utf-8")
    ).hexdigest()
    try:
        async with get_supabase_admin_client() as client:
            prior = await client.get(
                "/agent_project_snapshots",
                params={"project_id": f"eq.{project_id}", "select": "snapshot_number", "order": "snapshot_number.desc", "limit": "1"},
            )
            next_num = 1
            if prior.status_code < 400 and prior.json():
                next_num = int(prior.json()[0]["snapshot_number"]) + 1
            resp = await client.post(
                "/agent_project_snapshots",
                json={
                    "user_id": user_id,
                    "agent_id": agent_id,
                    "project_id": project_id,
                    "version_id": version_id,
                    "snapshot_number": next_num,
                    "sandbox_snapshot_id": sandbox_snapshot_id,
                    "manifest": manifest,
                    "test_status": test_status,
                    "lint_status": lint_status,
                    "files_count": len(files),
                    "checksum": checksum,
                },
                headers={"Prefer": "return=representation"},
            )
            if resp.status_code >= 400 or not resp.json():
                logger.warning("create_snapshot failed: %s", resp.text[:200])
                return None
            snapshot = resp.json()[0]
            snapshot_id = snapshot["id"]
            for f in files:
                fchecksum = hashlib.sha256(f["content"].encode("utf-8")).hexdigest()
                await client.post(
                    "/agent_project_files",
                    json={
                        "user_id": user_id,
                        "agent_id": agent_id,
                        "snapshot_id": snapshot_id,
                        "path": f["path"],
                        "content": f["content"],
                        "content_type": f.get("content_type", "text/plain"),
                        "checksum": fchecksum,
                    },
                )
            await client.patch(
                "/agent_projects",
                params={"id": f"eq.{project_id}"},
                json={"current_snapshot_id": snapshot_id, "updated_at": datetime.now(UTC).isoformat()},
            )
            return snapshot
    except Exception:  # noqa: BLE001
        logger.debug("create_snapshot skipped (db unavailable)")
    return None


async def list_snapshots(*, user_id: str, agent_id: str) -> list[dict[str, Any]]:
    try:
        async with get_supabase_admin_client() as client:
            resp = await client.get(
                "/agent_project_snapshots",
                params={
                    "agent_id": f"eq.{agent_id}",
                    "user_id": f"eq.{user_id}",
                    "select": "id,snapshot_number,test_status,lint_status,files_count,created_at,manifest",
                    "order": "snapshot_number.desc",
                },
            )
            if resp.status_code < 400:
                return resp.json()
    except Exception:  # noqa: BLE001
        pass
    return []


async def get_snapshot_files(*, user_id: str, snapshot_id: str) -> list[dict[str, Any]]:
    try:
        async with get_supabase_admin_client() as client:
            resp = await client.get(
                "/agent_project_files",
                params={
                    "snapshot_id": f"eq.{snapshot_id}",
                    "user_id": f"eq.{user_id}",
                    "select": "path,content,content_type,checksum",
                    "order": "path.asc",
                },
            )
            if resp.status_code < 400:
                return resp.json()
    except Exception:  # noqa: BLE001
        pass
    return []
