"""Server-only Supabase access via PostgREST (service-role key)."""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any

import httpx
from fastapi import HTTPException

from agent_service.config import get_settings
from agent_service.models.agent_spec import AgentSpec, migrate_v1_to_v2
from agent_service.security.redaction import redact_obj

logger = logging.getLogger(__name__)


def derive_builder_interrupt_type(
    identity_draft: dict[str, Any] | None,
    interrupt_type: str | None = None,
) -> str:
    """Derive interrupt type from explicit arg, draft marker, or default identity."""
    draft = identity_draft if isinstance(identity_draft, dict) else {}
    derived = draft.get("_interrupt_type")
    return str(interrupt_type or derived or "identity")


def get_supabase_admin_client() -> httpx.AsyncClient:
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
            "Content-Type": "application/json",
        },
        timeout=30.0,
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
                "test_status,model_provider,model_name,schema_compat,created_at",
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
        async with get_supabase_admin_client() as client:
            response = await client.patch(
                "/runs",
                params={
                    "id": f"eq.{run_id}",
                    "user_id": f"eq.{user_id}",
                    "status": "in.(queued,running,waiting_for_input)",
                },
                headers={"Prefer": "return=representation"},
                json={
                    "status": "canceled",
                    "completed_at": datetime.now(UTC).isoformat(),
                },
            )
            # Drop any queue lease so a crashed/restarted worker cannot resume this turn.
            await client.patch(
                "/run_queue",
                params={"run_id": f"eq.{run_id}", "status": "in.(pending,leased)"},
                json={"status": "dead", "last_error": "canceled_by_user"},
            )
        if response.status_code >= 400:
            raise HTTPException(
                status_code=502,
                detail={"code": "upstream_error", "message": "Run update failed."},
            )
        rows = response.json()
        return rows[0] if rows else None


class Persistence(SupabaseRepository):
    """Extended persistence used by Builder / Live / Publish."""

    async def create_run(
        self,
        *,
        run_id: str,
        user_id: str,
        agent_id: str,
        kind: str,
        thread_id: str | None,
        status: str = "queued",
        input_payload: dict[str, Any] | None = None,
    ) -> None:
        payload = {
            "id": run_id,
            "user_id": user_id,
            "agent_id": agent_id,
            "run_type": kind,
            "status": status if status in ("queued", "running", "completed", "failed", "canceled") else "queued",
            "thread_id": thread_id,
            "input": input_payload or {},
            "started_at": datetime.now(UTC).isoformat() if status == "running" else None,
        }
        async with get_supabase_admin_client() as client:
            response = await client.post("/runs", json=payload)
        if response.status_code >= 400:
            logger.warning(
                "create_run failed status=%s body=%s", response.status_code, response.text[:200]
            )

    async def enqueue_run(self, *, run_id: str, user_id: str) -> None:
        async with get_supabase_admin_client() as client:
            await client.post(
                "/run_queue",
                json={"run_id": run_id, "user_id": user_id, "status": "pending"},
            )

    async def update_run_status(self, run_id: str, status: str) -> None:
        payload: dict[str, Any] = {"status": status}
        if status == "running":
            payload["started_at"] = datetime.now(UTC).isoformat()
        if status in ("completed", "failed", "canceled", "succeeded"):
            # DB may use completed
            if status == "succeeded":
                payload["status"] = "completed"
            payload["completed_at"] = datetime.now(UTC).isoformat()
        # waiting_for_input may not be in DB enum — map to running
        if status == "waiting_for_input":
            payload["status"] = "running"
            payload["error_code"] = "BUILDER_INTERRUPTED"
        async with get_supabase_admin_client() as client:
            await client.patch("/runs", params={"id": f"eq.{run_id}"}, json=payload)

    async def complete_run(self, run_id: str) -> None:
        await self.update_run_status(run_id, "completed")
        async with get_supabase_admin_client() as client:
            await client.patch(
                "/run_queue",
                params={"run_id": f"eq.{run_id}"},
                json={"status": "completed"},
            )

    async def fail_run(self, run_id: str, code: str) -> None:
        async with get_supabase_admin_client() as client:
            await client.patch(
                "/runs",
                params={"id": f"eq.{run_id}"},
                json={
                    "status": "failed",
                    "error_code": code[:120],
                    "completed_at": datetime.now(UTC).isoformat(),
                },
            )
            await client.patch(
                "/run_queue",
                params={"run_id": f"eq.{run_id}"},
                json={"status": "failed", "last_error": code[:500]},
            )

    async def emit_event(self, run_id: str, event_type: str, payload: dict[str, Any]) -> None:
        safe = redact_obj(payload)
        async with get_supabase_admin_client() as client:
            # sequence: fetch max
            existing = await client.get(
                "/run_events",
                params={
                    "run_id": f"eq.{run_id}",
                    "select": "sequence",
                    "order": "sequence.desc",
                    "limit": "1",
                },
            )
            seq = 1
            if existing.status_code < 400:
                rows = existing.json()
                if rows:
                    seq = int(rows[0].get("sequence") or 0) + 1
            await client.post(
                "/run_events",
                json={
                    "run_id": run_id,
                    "event_type": event_type,
                    "sequence": seq,
                    "payload": safe,
                },
            )

    async def insert_assistant_message(
        self,
        *,
        thread_id: str,
        agent_id: str,
        user_id: str,
        content: str,
        metadata: dict[str, Any] | None = None,
        table: str = "builder_messages",
    ) -> str | None:
        async with get_supabase_admin_client() as client:
            response = await client.post(
                f"/{table}",
                json={
                    "thread_id": thread_id,
                    "agent_id": agent_id,
                    "user_id": user_id,
                    "role": "assistant",
                    "content": content,
                    "metadata": redact_obj(metadata or {}),
                },
                headers={"Prefer": "return=representation"},
            )
        if response.status_code >= 400:
            return None
        rows = response.json() if isinstance(response.json(), list) else []
        return str(rows[0]["id"]) if rows else None

    async def update_assistant_message(
        self,
        *,
        message_id: str,
        content: str | None = None,
        metadata: dict[str, Any] | None = None,
        table: str = "builder_messages",
    ) -> None:
        payload: dict[str, Any] = {}
        if content is not None:
            payload["content"] = content
        if metadata is not None:
            payload["metadata"] = redact_obj(metadata)
        if not payload:
            return
        async with get_supabase_admin_client() as client:
            await client.patch(
                f"/{table}",
                params={"id": f"eq.{message_id}"},
                json=payload,
            )

    async def record_usage_event(
        self,
        *,
        user_id: str,
        agent_id: str | None,
        run_id: str | None,
        event_name: str,
        quantity: float = 1,
        unit: str | None = None,
        estimated_cost: float = 0,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        async with get_supabase_admin_client() as client:
            await client.post(
                "/usage_events",
                json={
                    "user_id": user_id,
                    "agent_id": agent_id,
                    "run_id": run_id,
                    "event_name": event_name,
                    "quantity": quantity,
                    "unit": unit,
                    "estimated_cost": estimated_cost,
                    "metadata": redact_obj(metadata or {}),
                },
            )

    async def resolve_builder_form(
        self,
        *,
        thread_id: str,
        request_id: str,
        summary: dict[str, Any] | None = None,
    ) -> None:
        """Mark a form message as resolved so the UI collapses the inputs."""
        rows = await self._select(
            "builder_messages",
            {
                "thread_id": f"eq.{thread_id}",
                "role": "eq.assistant",
                "select": "id,metadata",
                "order": "created_at.desc",
                "limit": "20",
            },
        )
        for row in rows:
            meta = row.get("metadata") or {}
            if not isinstance(meta, dict):
                continue
            ui = meta.get("ui_component") or meta.get("uiComponent") or {}
            ui_rid = ui.get("request_id") or ui.get("requestId")
            interrupt_rid = meta.get("interrupt_run_id") or meta.get("interruptRunId")
            # Forms use a unique ui request_id; resume endpoints pass the run_id
            # (also stored as interrupt_run_id). Match either so the form collapses.
            if request_id not in {ui_rid, interrupt_rid}:
                continue
            patched = {
                **meta,
                "form_resolved": True,
                "ui_component": None,
            }
            if summary:
                patched["identity_summary"] = summary
            await self.update_assistant_message(message_id=row["id"], metadata=patched)
            return

    async def clear_thinking_messages(self, *, thread_id: str) -> None:
        """Remove ephemeral 'thinking' placeholders once real progress arrives."""
        rows = await self._select(
            "builder_messages",
            {
                "thread_id": f"eq.{thread_id}",
                "role": "eq.assistant",
                "select": "id,metadata",
                "order": "created_at.desc",
                "limit": "10",
            },
        )
        for row in rows:
            meta = row.get("metadata") or {}
            if not isinstance(meta, dict):
                continue
            if meta.get("card") != "thinking":
                continue
            async with get_supabase_admin_client() as client:
                await client.delete(
                    "/builder_messages",
                    params={"id": f"eq.{row['id']}"},
                )

    async def tag_thinking_with_run(self, *, thread_id: str, run_id: str) -> None:
        """Attach the active run id to the latest thinking bubble (for Stop + SSE)."""
        rows = await self._select(
            "builder_messages",
            {
                "thread_id": f"eq.{thread_id}",
                "role": "eq.assistant",
                "select": "id,metadata",
                "order": "created_at.desc",
                "limit": "5",
            },
        )
        for row in rows:
            meta = row.get("metadata") or {}
            if not isinstance(meta, dict) or meta.get("card") != "thinking":
                continue
            patched = {**meta, "run_id": run_id, "interrupt_run_id": run_id}
            await self.update_assistant_message(message_id=row["id"], metadata=patched)
            return

    async def get_latest_active_build_run(
        self, *, agent_id: str, user_id: str
    ) -> dict[str, Any] | None:
        rows = await self._select(
            "runs",
            {
                "agent_id": f"eq.{agent_id}",
                "user_id": f"eq.{user_id}",
                "run_type": "eq.build",
                "status": "in.(queued,running,waiting_for_input)",
                "select": "*",
                "order": "created_at.desc",
                "limit": "1",
            },
        )
        return rows[0] if rows else None

    async def update_agent_status(self, agent_id: str, user_id: str, status: str) -> None:
        async with get_supabase_admin_client() as client:
            await client.patch(
                "/agents",
                params={"id": f"eq.{agent_id}", "user_id": f"eq.{user_id}"},
                json={"status": status},
            )

    async def claim_first_ready_celebration(self, *, agent_id: str, user_id: str) -> bool:
        """Atomically mark first Ready celebration. Returns True only once per agent."""
        from datetime import datetime

        agent = await self.get_owned_agent(agent_id, user_id)
        if not agent:
            return False
        if agent.get("first_ready_celebrated"):
            return False
        now = datetime.now(UTC).isoformat()
        async with get_supabase_admin_client() as client:
            response = await client.patch(
                "/agents",
                params={
                    "id": f"eq.{agent_id}",
                    "user_id": f"eq.{user_id}",
                    "first_ready_celebrated": "eq.false",
                },
                json={
                    "first_ready_at": now,
                    "first_ready_celebrated": True,
                },
                headers={"Prefer": "return=representation"},
            )
        if response.status_code >= 400:
            return False
        rows = response.json() if isinstance(response.json(), list) else []
        return bool(rows)

    async def rename_agent(self, agent_id: str, user_id: str, name: str) -> None:
        async with get_supabase_admin_client() as client:
            await client.patch(
                "/agents",
                params={"id": f"eq.{agent_id}", "user_id": f"eq.{user_id}"},
                json={"name": name[:120]},
            )

    async def load_draft_spec(self, agent_id: str, user_id: str) -> AgentSpec | None:
        agent = await self.get_owned_agent(agent_id, user_id)
        if not agent:
            return None
        version_id = agent.get("draft_version_id")
        if not version_id:
            return None
        rows = await self._select(
            "agent_versions",
            {
                "id": f"eq.{version_id}",
                "agent_id": f"eq.{agent_id}",
                "select": "id,spec,graph_spec,schema_compat",
                "limit": "1",
            },
        )
        if not rows:
            return None
        raw = rows[0].get("spec") or {}
        if rows[0].get("graph_spec") and isinstance(raw, dict) and "graph" not in raw:
            raw = {**raw, "graph": rows[0]["graph_spec"]}
        try:
            return migrate_v1_to_v2(raw if isinstance(raw, dict) else {})
        except Exception:  # noqa: BLE001
            logger.warning("spec migration failed version=%s", version_id)
            return None

    async def persist_version(
        self,
        *,
        agent_id: str,
        user_id: str,
        spec: AgentSpec,
        test_status: str,
        change_summary: str,
    ) -> dict[str, Any]:
        versions = await self.list_agent_versions(agent_id)
        next_num = (versions[0]["version_number"] + 1) if versions else 1
        ts = test_status if test_status in (
            "not_run",
            "running",
            "passed",
            "passed_with_warnings",
            "failed",
        ) else ("passed" if test_status.startswith("passed") else "failed")
        payload = {
            "agent_id": agent_id,
            "created_by": user_id,
            "version_number": next_num,
            "spec": spec.model_dump(mode="json"),
            "graph_spec": spec.graph.model_dump(mode="json"),
            "schema_compat": "v2",
            "change_summary": change_summary[:500],
            "validation_status": "valid",
            "test_status": ts,
        }
        async with get_supabase_admin_client() as client:
            response = await client.post(
                "/agent_versions",
                json=payload,
                headers={"Prefer": "return=representation"},
            )
            if response.status_code >= 400:
                logger.warning("persist_version failed: %s", response.text[:300])
                return {}
            rows = response.json()
            version = rows[0] if rows else {}
            if version.get("id"):
                await client.patch(
                    "/agents",
                    params={"id": f"eq.{agent_id}", "user_id": f"eq.{user_id}"},
                    json={"draft_version_id": version["id"], "name": spec.identity.name},
                )
            return version

    async def save_builder_interrupt(
        self,
        *,
        run_id: str,
        user_id: str,
        agent_id: str,
        thread_id: str,
        prompt: str,
        identity_draft: dict[str, Any],
        interrupt_type: str | None = None,
    ) -> None:
        draft = identity_draft or {}
        itype = derive_builder_interrupt_type(draft, interrupt_type)
        async with get_supabase_admin_client() as client:
            await client.patch(
                "/runs",
                params={"id": f"eq.{run_id}", "user_id": f"eq.{user_id}"},
                json={
                    "error_code": "BUILDER_INTERRUPTED",
                    "input": {
                        "interrupt": {
                            "type": itype,
                            "agent_id": agent_id,
                            "thread_id": thread_id,
                            "prompt": prompt[:8000],
                            "identity_draft": draft,
                            "status": "open",
                        }
                    },
                },
            )

    async def get_builder_interrupt(self, run_id: str, user_id: str) -> dict[str, Any] | None:
        run = await self.get_owned_run(run_id, user_id)
        if not run:
            return None
        meta = run.get("input") or {}
        interrupt = meta.get("interrupt") if isinstance(meta, dict) else None
        if not interrupt:
            return None
        draft = interrupt.get("identity_draft") or {}
        derived = draft.get("_interrupt_type") if isinstance(draft, dict) else None
        return {
            "agent_id": interrupt.get("agent_id") or run.get("agent_id"),
            "thread_id": interrupt.get("thread_id") or run.get("thread_id"),
            "prompt": interrupt.get("prompt") or "",
            "status": interrupt.get("status") or "open",
            "identity_draft": draft,
            "type": interrupt.get("type") or derived or "identity",
        }

    async def clear_builder_interrupt(self, run_id: str, user_id: str) -> None:
        run = await self.get_owned_run(run_id, user_id)
        if not run:
            return
        meta = dict(run.get("input") or {})
        interrupt = dict(meta.get("interrupt") or {})
        interrupt["status"] = "completed"
        meta["interrupt"] = interrupt
        async with get_supabase_admin_client() as client:
            await client.patch(
                "/runs",
                params={"id": f"eq.{run_id}", "user_id": f"eq.{user_id}"},
                json={"input": meta, "error_code": None},
            )

    async def list_run_events(self, run_id: str, user_id: str) -> list[dict[str, Any]]:
        run = await self.get_owned_run(run_id, user_id)
        if not run:
            return []
        return await self._select(
            "run_events",
            {
                "run_id": f"eq.{run_id}",
                "select": "*",
                "order": "sequence.asc",
            },
        )

    async def audit(
        self,
        *,
        user_id: str | None,
        agent_id: str | None,
        action: str,
        resource_type: str,
        resource_id: str | None,
        result: str,
        risk_level: str = "low",
        metadata: dict[str, Any] | None = None,
        request_id: str | None = None,
    ) -> None:
        async with get_supabase_admin_client() as client:
            await client.post(
                "/security_audit_events",
                json={
                    "user_id": user_id,
                    "agent_id": agent_id,
                    "action": action,
                    "resource_type": resource_type,
                    "resource_id": resource_id,
                    "result": result,
                    "risk_level": risk_level,
                    "metadata": redact_obj(metadata or {}),
                    "request_id": request_id,
                },
            )


def get_repository() -> SupabaseRepository:
    return SupabaseRepository()


def get_persistence() -> Persistence:
    return Persistence()
