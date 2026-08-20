"""Canonical get_or_create installation service + ownership helpers."""

from __future__ import annotations

import logging
import uuid
from typing import Any, Literal

from agent_service.supabase_client import Persistence, get_supabase_admin_client

logger = logging.getLogger(__name__)

InstallationStatus = Literal["setup_required", "ready", "needs_attention"]

LEGACY_FALLBACK_METRIC = "legacy_fallback_used"


class InstallationError(Exception):
    def __init__(self, code: str, message: str = "") -> None:
        super().__init__(message or code)
        self.code = code


class InstallationService:
    def __init__(self, persistence: Persistence | None = None) -> None:
        self.db = persistence or Persistence()

    async def get_installation(
        self, *, installation_id: str, user_id: str
    ) -> dict[str, Any] | None:
        rows = await self.db._select(
            "agent_installations",
            {
                "id": f"eq.{installation_id}",
                "user_id": f"eq.{user_id}",
                "select": "*",
                "limit": "1",
            },
        )
        return rows[0] if rows else None

    async def get_for_user_agent(
        self, *, user_id: str, agent_id: str
    ) -> dict[str, Any] | None:
        rows = await self.db._select(
            "agent_installations",
            {
                "user_id": f"eq.{user_id}",
                "agent_id": f"eq.{agent_id}",
                "select": "*",
                "limit": "1",
            },
        )
        return rows[0] if rows else None

    async def assert_owns_installation(
        self, *, installation_id: str, user_id: str
    ) -> dict[str, Any]:
        row = await self.get_installation(installation_id=installation_id, user_id=user_id)
        if not row:
            raise InstallationError("INSTALLATION_FORBIDDEN", "Installation not found.")
        return row

    async def get_or_create(
        self,
        *,
        user_id: str,
        agent_id: str,
        pinned_version_id: str | None = None,
    ) -> dict[str, Any]:
        """Idempotent: same user + definition → same installation (MVP unique).

        Never returns another user's installation. Consumers may install published
        definitions; owners may always install their own.
        """
        existing = await self.get_for_user_agent(user_id=user_id, agent_id=agent_id)
        if existing:
            return existing

        agent = await self._load_installable_agent(agent_id=agent_id, user_id=user_id)
        if not agent:
            raise InstallationError("AGENT_NOT_INSTALLABLE", "Agent not found or not installable.")

        version_id = pinned_version_id or agent.get("published_version_id") or agent.get(
            "draft_version_id"
        )
        installation_id = str(uuid.uuid4())
        payload = {
            "id": installation_id,
            "agent_id": agent_id,
            "user_id": user_id,
            "pinned_version_id": version_id,
            "status": "setup_required",
        }
        async with get_supabase_admin_client() as client:
            response = await client.post(
                "/agent_installations",
                json=payload,
                headers={"Prefer": "return=representation"},
            )
            if response.status_code >= 400:
                # Race: unique (user_id, agent_id) — re-fetch
                raced = await self.get_for_user_agent(user_id=user_id, agent_id=agent_id)
                if raced:
                    return raced
                logger.warning(
                    "installation_create_failed status=%s body=%s",
                    response.status_code,
                    response.text[:200],
                )
                raise InstallationError("INSTALLATION_CREATE_FAILED", "Could not create installation.")
            rows = response.json()
            created = rows[0] if isinstance(rows, list) and rows else payload
        await self.db.audit(
            user_id=user_id,
            agent_id=agent_id,
            action="installation.created",
            resource_type="agent_installation",
            resource_id=str(created.get("id") or installation_id),
            result="success",
            risk_level="low",
            metadata={"status": "setup_required"},
        )
        return created

    async def ensure_owner_installation(
        self, *, agent_id: str, owner_user_id: str
    ) -> dict[str, Any]:
        """Create/retrieve the creator's own installation (same path as consumers)."""
        return await self.get_or_create(user_id=owner_user_id, agent_id=agent_id)

    async def update_status(
        self,
        *,
        installation_id: str,
        user_id: str,
        status: InstallationStatus,
    ) -> None:
        await self.assert_owns_installation(installation_id=installation_id, user_id=user_id)
        async with get_supabase_admin_client() as client:
            await client.patch(
                "/agent_installations",
                params={"id": f"eq.{installation_id}", "user_id": f"eq.{user_id}"},
                json={"status": status},
            )
        await self.db.audit(
            user_id=user_id,
            agent_id=None,
            action=f"installation.{status}",
            resource_type="agent_installation",
            resource_id=installation_id,
            result="success",
            risk_level="low",
            metadata={"status": status},
        )

    async def is_owner_installation(
        self, *, installation: dict[str, Any]
    ) -> bool:
        agent_id = str(installation.get("agent_id") or "")
        user_id = str(installation.get("user_id") or "")
        if not agent_id or not user_id:
            return False
        agent = await self.db.get_owned_agent(agent_id, user_id)
        return agent is not None

    async def _load_installable_agent(
        self, *, agent_id: str, user_id: str
    ) -> dict[str, Any] | None:
        owned = await self.db.get_owned_agent(agent_id, user_id)
        if owned:
            return owned
        rows = await self.db._select(
            "agents",
            {
                "id": f"eq.{agent_id}",
                "status": "eq.published",
                "deleted_at": "is.null",
                "select": "*",
                "limit": "1",
            },
        )
        if not rows:
            return None
        agent = rows[0]
        visibility = agent.get("listing_visibility")
        # Missing column (legacy) or explicit public listing: anyone can install.
        if visibility in (None, "public"):
            return agent
        approved = await self.db._select(
            "agent_access_requests",
            {
                "agent_id": f"eq.{agent_id}",
                "requester_id": f"eq.{user_id}",
                "status": "eq.approved",
                "select": "id",
                "limit": "1",
            },
        )
        return agent if approved else None


async def get_or_create_installation(
    *,
    user_id: str,
    agent_id: str,
    pinned_version_id: str | None = None,
    persistence: Persistence | None = None,
) -> dict[str, Any]:
    return await InstallationService(persistence).get_or_create(
        user_id=user_id,
        agent_id=agent_id,
        pinned_version_id=pinned_version_id,
    )


def log_legacy_fallback(*, resource: str, agent_id: str, user_id: str) -> None:
    """Telemetry for owner-only legacy agent-scoped resolution."""
    logger.info(
        "%s resource=%s agent_id=%s user_id=%s",
        LEGACY_FALLBACK_METRIC,
        resource,
        agent_id,
        user_id,
    )
