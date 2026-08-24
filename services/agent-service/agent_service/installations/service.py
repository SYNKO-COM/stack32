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

        # A creator's plan carries an audience: 500 subscribers on Starter,
        # 1000 on Pro, 2000 on Scale — total across all their agents, owner
        # installs excluded. The check lives here because every subscribe
        # path funnels through this method; when the audience is full, the
        # public page greys its button on this same error code.
        owner_id = str(agent.get("user_id") or "")
        if owner_id and owner_id != user_id:
            if await self._owner_audience_full(owner_id):
                raise InstallationError(
                    "SUBSCRIBER_LIMIT_REACHED",
                    "This creator's subscriber limit is reached.",
                )

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

    async def _owner_audience_full(self, owner_id: str) -> bool:
        """True when the creator's total consumer installations meet their cap."""
        from agent_service.billing.plans import PLANS

        limit: int | None
        try:
            async with get_supabase_admin_client() as client:
                ent = await client.post(
                    "/rpc/resolve_user_entitlements", json={"p_user_id": owner_id}
                )
                plan_key = "free"
                if ent.status_code < 400:
                    payload = ent.json()
                    row = payload[0] if isinstance(payload, list) and payload else payload
                    if isinstance(row, dict) and row.get("plan_key"):
                        plan_key = str(row["plan_key"])
                plan = PLANS.get(plan_key)  # type: ignore[arg-type]
                limit = plan.max_subscribers if plan else 0
                if limit is None:
                    return False

                agents = await client.get(
                    "/agents",
                    params={
                        "user_id": f"eq.{owner_id}",
                        "deleted_at": "is.null",
                        "select": "id",
                    },
                )
                ids = [
                    str(r.get("id"))
                    for r in (agents.json() if agents.status_code < 400 else [])
                    if r.get("id")
                ]
                if not ids:
                    return limit <= 0
                count = await client.get(
                    "/agent_installations",
                    params={
                        "agent_id": f"in.({','.join(ids)})",
                        "user_id": f"neq.{owner_id}",
                        "select": "id",
                    },
                    headers={"Prefer": "count=exact", "Range": "0-0"},
                )
                total = 0
                content_range = count.headers.get("content-range") or ""
                if "/" in content_range:
                    try:
                        total = int(content_range.rsplit("/", 1)[1])
                    except ValueError:
                        total = 0
                return total >= limit
        except InstallationError:
            raise
        except Exception:  # noqa: BLE001
            # The cap protects the creator's plan, not the platform's safety.
            # A lookup hiccup must not lock every subscriber out.
            logger.warning("subscriber_cap_lookup_failed owner=%s", owner_id, exc_info=True)
            return False

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
