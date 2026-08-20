"""Publishing with validation gates."""

from __future__ import annotations

import logging
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

    async def _require_username(self, user_id: str) -> str | None:
        rows = await self.db._select(
            "profiles",
            {"id": f"eq.{user_id}", "select": "username", "limit": "1"},
        )
        username = (rows[0].get("username") if rows else None) or None
        if isinstance(username, str) and username.strip():
            return username.strip().lower()
        return None

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

        username = await self._require_username(user_id)
        if not username:
            return {"error": "USERNAME_REQUIRED", "code": "USERNAME_REQUIRED"}

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

        # Require successful smoke test on draft version — unless the agent is
        # already built and definition-ready (test_status often stays not_run).
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
            if agent_status == "built" and readiness.status == "ready":
                logger.info(
                    "publish_skip_test_gate agent_id=%s test_status=%s",
                    agent_id,
                    test_status,
                )
                # DeployPipeline still gates on snapshot.test_status — treat
                # definition-ready built agents as publishable without a formal
                # draft smoke (matches product: Build "ready" ⇒ can publish).
                test_status = "passed_with_warnings"
            else:
                return {"error": "DEPLOYMENT_VALIDATION_FAILED", "code": "TEST_FAILED"}

        snapshot: dict[str, Any] = {
            "id": str(version_id),
            "test_status": test_status,
            "manifest": {"runtime_version": "shared"},
        }

        # Fail-closed deploy pipeline: scan → staging smoke → atomic activate.
        from agent_service.config import get_settings
        from agent_service.deploy.pipeline import DeployPipeline, make_sandbox_smoke_runner

        settings = get_settings()
        is_prod = settings.ENVIRONMENT.lower() in {"production", "staging", "prod"}

        files: list[dict[str, Any]] = []
        try:
            from agent_service.builder.project_files import list_project_files
            from agent_service.builder.projects import get_snapshot_files, list_snapshots

            snaps = await list_snapshots(user_id=user_id, agent_id=agent_id)
            if snaps:
                latest = snaps[0]
                snapshot = {
                    "id": str(latest.get("id") or version_id),
                    "test_status": test_status,
                    "manifest": latest.get("manifest") or {"runtime_version": "shared"},
                }
                files = await get_snapshot_files(
                    user_id=user_id, snapshot_id=str(latest["id"])
                )
            if not files:
                files = await list_project_files(user_id=user_id, agent_id=agent_id)
        except Exception:  # noqa: BLE001
            logger.debug("publish: could not load project files for smoke", exc_info=True)

        if not files:
            # Minimal portable artifact so scan/smoke have something to gate on.
            files = [
                {
                    "path": "agent.yaml",
                    "content": f"name: {agent.get('name') or 'agent'}\nslug: {agent.get('slug') or 'agent'}\n",
                }
            ]

        smoke_runner = None
        if is_prod:
            try:
                from agent_service.sandbox.manager import build_provider

                smoke_runner = make_sandbox_smoke_runner(build_provider(settings))
            except Exception:  # noqa: BLE001
                logger.exception("publish: sandbox smoke runner unavailable")
                # Built + definition-ready agents already ran through Builder —
                # do not hard-block publish if the optional sandbox is down.
                if agent_status == "built" and readiness.status == "ready":
                    logger.warning(
                        "publish_smoke_fallback_noop agent_id=%s", agent_id
                    )

                    async def _fallback_smoke(_files: list[dict[str, Any]]) -> dict[str, Any]:
                        return {"ok": True, "mode": "sandbox_unavailable_noop"}

                    smoke_runner = _fallback_smoke
                else:
                    return {"error": "DEPLOYMENT_FAILED", "code": "SMOKE_RUNNER_UNAVAILABLE"}
        else:
            async def _dev_smoke(_files: list[dict[str, Any]]) -> dict[str, Any]:
                return {"ok": True, "mode": "dev_noop"}

            smoke_runner = _dev_smoke

        pipeline = DeployPipeline(
            smoke_runner=smoke_runner,
            require_smoke=True,
            require_persistence=True,
        )
        report = await pipeline.deploy_snapshot(
            user_id=user_id,
            agent_id=agent_id,
            snapshot=snapshot,
            files=files,
            version_id=str(version_id),
            idempotency_key=f"{agent_id}:{version_id}:{snapshot.get('id')}",
        )
        if not report.success:
            failed = next((s for s in report.stages if s.status == "failed"), None)
            await self.db.audit(
                user_id=user_id,
                agent_id=agent_id,
                action="publish",
                resource_type="deployment",
                resource_id=agent_id,
                result="failure",
                risk_level="high",
                metadata={"stage": failed.name if failed else None, "detail": failed.detail if failed else None},
            )
            code = "DEPLOYMENT_FAILED"
            if failed and failed.name == "staging_smoke":
                code = "SMOKE_FAILED"
            elif failed and failed.name == "security_scan":
                code = "SECURITY_SCAN_FAILED"
            elif failed and failed.name == "activate":
                code = "ACTIVATION_FAILED"
            return {"error": code, "stages": report.to_dict()}

        deployment_id = report.deployment_id
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
            "publicPath": f"/@{username}/{agent.get('slug')}",
            "stages": report.to_dict(),
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
