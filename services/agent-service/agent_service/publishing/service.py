"""Publishing with validation gates."""

from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime
from typing import Any

from agent_service.compiler.graph_compiler import GraphCompileError, compile_graph
from agent_service.models.agent_spec import AgentSpec
from agent_service.models.graph_spec import GraphSpec
from agent_service.supabase_client import Persistence, get_supabase_admin_client

logger = logging.getLogger(__name__)


class PublishService:
    def __init__(self, persistence: Persistence | None = None) -> None:
        self.db = persistence or Persistence()

    async def publish(self, *, user_id: str, agent_id: str) -> dict[str, Any]:
        agent = await self.db.get_owned_agent(agent_id, user_id)
        if not agent:
            await self.db.audit(
                user_id=user_id,
                agent_id=agent_id,
                action="publish",
                resource_type="agent",
                resource_id=agent_id,
                result="denied",
                risk_level="high",
            )
            return {"error": "forbidden"}

        spec = await self.db.load_draft_spec(agent_id, user_id)
        if not spec:
            return {"error": "AGENT_SPEC_INVALID"}

        try:
            AgentSpec.model_validate(spec.model_dump())
            GraphSpec.model_validate(spec.graph.model_dump())
            compile_graph(spec)
        except GraphCompileError as exc:
            await self.db.audit(
                user_id=user_id,
                agent_id=agent_id,
                action="publish",
                resource_type="agent",
                resource_id=agent_id,
                result="failure",
                risk_level="medium",
                metadata={"code": exc.code},
            )
            return {"error": "DEPLOYMENT_VALIDATION_FAILED", "code": exc.code}
        except Exception:  # noqa: BLE001
            return {"error": "DEPLOYMENT_VALIDATION_FAILED"}

        # Definition readiness + sanitizer — creator OAuth/LLM are installation-scoped.
        from agent_service.publishing.sanitizer import (
            PublishSanitizeError,
            assert_portable_definition,
        )
        from agent_service.readiness import evaluate_definition_readiness

        try:
            portable = assert_portable_definition(spec)
            AgentSpec.model_validate(portable)
        except PublishSanitizeError as exc:
            await self.db.audit(
                user_id=user_id,
                agent_id=agent_id,
                action="publish",
                resource_type="agent",
                resource_id=agent_id,
                result="denied",
                risk_level="high",
                metadata={"code": exc.code, "details": exc.details[:20]},
            )
            return {
                "error": "DEPLOYMENT_VALIDATION_FAILED",
                "code": exc.code,
                "details": exc.details[:20],
            }
        except Exception:  # noqa: BLE001
            return {"error": "DEPLOYMENT_VALIDATION_FAILED", "code": "SANITIZE_FAILED"}

        agent_status = str(agent.get("status") or "")
        readiness = await evaluate_definition_readiness(
            agent_id=agent_id,
            user_id=user_id,
            spec=spec,
            db=self.db,
            build_ok=agent_status
            not in {"needs_attention", "building", "draft", "waiting_for_input"},
        )
        if readiness.status != "ready" or agent_status in {
            "needs_attention",
            "waiting_for_input",
            "building",
            "draft",
        }:
            await self.db.audit(
                user_id=user_id,
                agent_id=agent_id,
                action="publish",
                resource_type="agent",
                resource_id=agent_id,
                result="denied",
                risk_level="medium",
                metadata={"readiness": readiness.status, "agent_status": agent_status},
            )
            return {
                "error": "DEPLOYMENT_VALIDATION_FAILED",
                "code": "DEFINITION_READINESS_FAILED",
                "readiness": readiness.status,
                "checks": [
                    {"key": c.key, "ok": c.ok, "message": c.message, "severity": c.severity}
                    for c in readiness.checks
                ],
            }

        version_id = agent.get("draft_version_id")
        if not version_id:
            return {"error": "DEPLOYMENT_VALIDATION_FAILED"}

        async with get_supabase_admin_client() as client:
            await client.patch(
                "/agent_versions",
                params={"id": f"eq.{version_id}"},
                json={"spec": portable},
            )

        # Require successful smoke test on draft version
        rows = await self.db._select(
            "agent_versions",
            {
                "id": f"eq.{version_id}",
                "select": "id,test_status",
                "limit": "1",
            },
        )
        test_status = rows[0].get("test_status") if rows else "not_run"
        if test_status not in ("passed", "passed_with_warnings"):
            return {"error": "DEPLOYMENT_VALIDATION_FAILED", "code": "TEST_FAILED"}

        deployment_id = str(uuid.uuid4())
        async with get_supabase_admin_client() as client:
            # Disable previous active
            await client.patch(
                "/agent_deployments",
                params={
                    "agent_id": f"eq.{agent_id}",
                    "environment": "eq.production",
                    "status": "eq.active",
                },
                json={
                    "status": "disabled",
                    "unpublished_at": datetime.now(UTC).isoformat(),
                },
            )
            response = await client.post(
                "/agent_deployments",
                json={
                    "id": deployment_id,
                    "user_id": user_id,
                    "agent_id": agent_id,
                    "agent_version_id": version_id,
                    "environment": "production",
                    "status": "active",
                    "published_at": datetime.now(UTC).isoformat(),
                    "runtime_config": {"hosted": True, "queue": "run_queue"},
                },
                headers={"Prefer": "return=representation"},
            )
            if response.status_code >= 400:
                logger.warning("deployment insert failed: %s", response.text[:200])
                return {"error": "DEPLOYMENT_FAILED"}
            await client.patch(
                "/agents",
                params={"id": f"eq.{agent_id}", "user_id": f"eq.{user_id}"},
                json={
                    "status": "published",
                    "published_version_id": version_id,
                },
            )

        await self.db.audit(
            user_id=user_id,
            agent_id=agent_id,
            action="publish",
            resource_type="deployment",
            resource_id=deployment_id,
            result="success",
            risk_level="medium",
        )
        return {
            "status": "active",
            "deployment_id": deployment_id,
            "agent_version_id": version_id,
        }

    async def unpublish(self, *, user_id: str, agent_id: str) -> dict[str, Any]:
        agent = await self.db.get_owned_agent(agent_id, user_id)
        if not agent:
            return {"error": "forbidden"}
        async with get_supabase_admin_client() as client:
            await client.patch(
                "/agent_deployments",
                params={
                    "agent_id": f"eq.{agent_id}",
                    "user_id": f"eq.{user_id}",
                    "status": "eq.active",
                },
                json={
                    "status": "disabled",
                    "unpublished_at": datetime.now(UTC).isoformat(),
                },
            )
            await client.patch(
                "/agents",
                params={"id": f"eq.{agent_id}", "user_id": f"eq.{user_id}"},
                json={"status": "built", "published_version_id": None},
            )
        await self.db.audit(
            user_id=user_id,
            agent_id=agent_id,
            action="unpublish",
            resource_type="agent",
            resource_id=agent_id,
            result="success",
            risk_level="medium",
        )
        return {"status": "disabled"}

    async def get_deployment(self, *, user_id: str, agent_id: str) -> dict[str, Any] | None:
        rows = await self.db._select(
            "agent_deployments",
            {
                "agent_id": f"eq.{agent_id}",
                "user_id": f"eq.{user_id}",
                "select": "*",
                "order": "created_at.desc",
                "limit": "1",
            },
        )
        return rows[0] if rows else None
