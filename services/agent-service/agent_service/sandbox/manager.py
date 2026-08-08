"""Sandbox lifecycle manager.

Selects the configured provider, builds a `SandboxConfig` from settings, and
tracks workspace rows in `builder_workspaces` so a browser disconnect never
destroys an in-flight build. Provider-neutral: callers depend only on
`SandboxProvider`.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from typing import Any

from agent_service.config import Settings, get_settings
from agent_service.sandbox.base import (
    SandboxConfig,
    SandboxProvider,
    WorkspaceHandle,
)
from agent_service.supabase_client import get_supabase_admin_client

logger = logging.getLogger(__name__)


def build_provider(settings: Settings | None = None) -> SandboxProvider:
    settings = settings or get_settings()
    if settings.SANDBOX_PROVIDER == "e2b":
        from agent_service.sandbox.e2b import E2BSandbox

        return E2BSandbox(api_key=settings.E2B_API_KEY, template=settings.E2B_TEMPLATE)
    from agent_service.sandbox.local import LocalSandbox

    return LocalSandbox()


def config_from_settings(settings: Settings | None = None) -> SandboxConfig:
    settings = settings or get_settings()
    return SandboxConfig(
        command_timeout_seconds=settings.SANDBOX_COMMAND_TIMEOUT_SECONDS,
        wall_clock_seconds=settings.SANDBOX_WALL_CLOCK_SECONDS,
        max_output_bytes=settings.SANDBOX_MAX_OUTPUT_BYTES,
        max_file_bytes=settings.SANDBOX_MAX_FILE_BYTES,
        allow_network=settings.SANDBOX_ALLOW_NETWORK,
        template=settings.E2B_TEMPLATE,
    )


class SandboxManager:
    """Create/resume/destroy workspaces and mirror state in the DB."""

    def __init__(self, provider: SandboxProvider | None = None, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        self.provider = provider or build_provider(self.settings)

    async def ensure_workspace(
        self, *, user_id: str, agent_id: str, run_id: str
    ) -> WorkspaceHandle:
        """Return an existing live workspace for the run, else create one."""
        existing = await self._load_row(run_id=run_id, user_id=user_id)
        if existing and existing.get("status") in ("active", "paused"):
            handle = WorkspaceHandle(
                provider=existing["provider"],
                workspace_id=existing["provider_workspace_id"],
                root=(existing.get("metadata") or {}).get("root", "/workspace"),
                metadata=existing.get("metadata") or {},
            )
            try:
                return await self.provider.resume_workspace(handle)
            except Exception:  # noqa: BLE001
                logger.warning("resume failed run=%s; creating fresh workspace", run_id)
        handle = await self.provider.create_workspace(config_from_settings(self.settings))
        await self._persist_row(
            user_id=user_id, agent_id=agent_id, run_id=run_id, handle=handle, status="active"
        )
        return handle

    async def snapshot(self, handle: WorkspaceHandle, *, run_id: str) -> str:
        snap = await self.provider.snapshot_workspace(handle)
        await self._patch_row(run_id=run_id, patch={"snapshot_id": snap, "status": "paused"})
        return snap

    async def destroy(self, handle: WorkspaceHandle, *, run_id: str) -> None:
        try:
            await self.provider.destroy_workspace(handle)
        finally:
            await self._patch_row(run_id=run_id, patch={"status": "destroyed"})

    # --- DB mirror ---------------------------------------------------------
    async def _persist_row(
        self,
        *,
        user_id: str,
        agent_id: str,
        run_id: str,
        handle: WorkspaceHandle,
        status: str,
    ) -> None:
        expires = (datetime.now(UTC) + timedelta(seconds=self.settings.SANDBOX_WALL_CLOCK_SECONDS)).isoformat()
        payload = {
            "user_id": user_id,
            "agent_id": agent_id,
            "run_id": run_id,
            "provider": handle.provider,
            "provider_workspace_id": handle.workspace_id,
            "status": status,
            "metadata": {"root": handle.root, **handle.metadata},
            "expires_at": expires,
        }
        try:
            async with get_supabase_admin_client() as client:
                await client.post("/builder_workspaces", json=payload)
        except Exception:  # noqa: BLE001
            logger.debug("builder_workspaces insert skipped (db unavailable)")

    async def _patch_row(self, *, run_id: str, patch: dict[str, Any]) -> None:
        patch = {**patch, "updated_at": datetime.now(UTC).isoformat()}
        try:
            async with get_supabase_admin_client() as client:
                await client.patch(
                    "/builder_workspaces", params={"run_id": f"eq.{run_id}"}, json=patch
                )
        except Exception:  # noqa: BLE001
            logger.debug("builder_workspaces patch skipped (db unavailable)")

    async def _load_row(self, *, run_id: str, user_id: str) -> dict[str, Any] | None:
        try:
            async with get_supabase_admin_client() as client:
                resp = await client.get(
                    "/builder_workspaces",
                    params={
                        "run_id": f"eq.{run_id}",
                        "user_id": f"eq.{user_id}",
                        "select": "*",
                        "order": "created_at.desc",
                        "limit": "1",
                    },
                )
            if resp.status_code < 400:
                rows = resp.json()
                return rows[0] if rows else None
        except Exception:  # noqa: BLE001
            return None
        return None
