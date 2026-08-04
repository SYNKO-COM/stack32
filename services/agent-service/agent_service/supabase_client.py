"""Server-only Supabase access via the PostgREST API (service-role key).

The service-role client bypasses RLS, so EVERY user-facing query in this
module must filter on the authenticated user's id (ownership verification).
Never trust a user id supplied in a request body.
"""

from typing import Any

import httpx
from fastapi import HTTPException

from agent_service.config import get_settings


def get_supabase_admin_client() -> httpx.AsyncClient:
    """Return an httpx client bound to the project's PostgREST endpoint."""
    settings = get_settings()
    if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_ROLE_KEY:
        raise HTTPException(
            status_code=503,
            detail={"code": "not_configured", "message": "Supabase is not configured."},
        )
    return httpx.AsyncClient(
        base_url=f"{settings.SUPABASE_URL}/rest/v1",
        headers={
            "apikey": settings.SUPABASE_SERVICE_ROLE_KEY,
            "Authorization": f"Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}",
        },
        timeout=10.0,
    )


class SupabaseRepository:
    """Thin data-access layer with mandatory ownership filters."""

    async def _select(self, table: str, params: dict[str, str]) -> list[dict[str, Any]]:
        async with get_supabase_admin_client() as client:
            response = await client.get(f"/{table}", params=params)
        if response.status_code >= 400:
            raise HTTPException(
                status_code=502,
                detail={"code": "upstream_error", "message": "Database query failed."},
            )
        return response.json()

    async def get_owned_agent(self, agent_id: str, user_id: str) -> dict[str, Any] | None:
        rows = await self._select(
            "agents",
            {
                "id": f"eq.{agent_id}",
                "user_id": f"eq.{user_id}",
                "deleted_at": "is.null",
                "select": "*",
                "limit": "1",
            },
        )
        return rows[0] if rows else None

    async def list_agent_versions(self, agent_id: str) -> list[dict[str, Any]]:
        return await self._select(
            "agent_versions",
            {
                "agent_id": f"eq.{agent_id}",
                "select": "id,agent_id,version_number,change_summary,validation_status,"
                "test_status,model_provider,model_name,created_at",
                "order": "version_number.desc",
            },
        )

    async def get_owned_run(self, run_id: str, user_id: str) -> dict[str, Any] | None:
        rows = await self._select(
            "runs",
            {
                "id": f"eq.{run_id}",
                "user_id": f"eq.{user_id}",
                "select": "*",
                "limit": "1",
            },
        )
        return rows[0] if rows else None

    async def cancel_run(self, run_id: str, user_id: str) -> dict[str, Any] | None:
        """Cancel a queued/running run owned by the user."""
        async with get_supabase_admin_client() as client:
            response = await client.patch(
                "/runs",
                params={
                    "id": f"eq.{run_id}",
                    "user_id": f"eq.{user_id}",
                    "status": "in.(queued,running)",
                },
                headers={"Prefer": "return=representation"},
                json={"status": "canceled", "completed_at": "now()"},
            )
        if response.status_code >= 400:
            raise HTTPException(
                status_code=502,
                detail={"code": "upstream_error", "message": "Run update failed."},
            )
        rows = response.json()
        return rows[0] if rows else None


def get_repository() -> SupabaseRepository:
    return SupabaseRepository()
