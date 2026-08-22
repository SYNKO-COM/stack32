"""Atomic LLM budget reservations (best-effort via Supabase)."""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass

from agent_service.billing.pricing import estimate_max_call_cost_usd
from agent_service.config import get_settings

logger = logging.getLogger(__name__)


@dataclass
class BudgetReservation:
    id: str
    idempotency_key: str
    reserved_usd: float


async def reserve_llm_budget(
    *,
    user_id: str,
    run_id: str | None,
    model: str,
    input_tokens: int,
    max_output_tokens: int,
    idempotency_key: str | None = None,
) -> BudgetReservation | None:
    """Hold estimated max call cost before an expensive LLM request."""
    settings = get_settings()
    if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_ROLE_KEY:
        return None

    key = idempotency_key or f"{run_id or 'run'}:{uuid.uuid4().hex}"
    reserved = estimate_max_call_cost_usd(
        model,
        input_tokens=input_tokens,
        max_output_tokens=max_output_tokens,
    )
    if reserved <= 0:
        return None

    try:
        from agent_service.supabase_client import get_supabase_admin_client

        async with get_supabase_admin_client() as client:
            response = await client.post(
                "/llm_budget_reservations",
                json={
                    "user_id": user_id,
                    "run_id": run_id,
                    "idempotency_key": key,
                    "reserved_usd": reserved,
                    "status": "held",
                    "metadata": {"model": model},
                },
            )
            if response.status_code >= 400:
                logger.warning("budget reservation failed status=%s", response.status_code)
                return None
            row = response.json()
            if isinstance(row, list) and row:
                row = row[0]
            return BudgetReservation(
                id=str(row.get("id") or key),
                idempotency_key=key,
                reserved_usd=reserved,
            )
    except Exception:  # noqa: BLE001
        logger.debug("budget reservation skipped", exc_info=True)
        return None


async def reconcile_llm_budget(
    *,
    reservation: BudgetReservation | None,
    consumed_usd: float,
    success: bool,
) -> None:
    if reservation is None:
        return
    settings = get_settings()
    if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_ROLE_KEY:
        return
    status = "consumed" if success else "released"
    try:
        from agent_service.supabase_client import get_supabase_admin_client

        async with get_supabase_admin_client() as client:
            await client.patch(
                "/llm_budget_reservations",
                params={"idempotency_key": f"eq.{reservation.idempotency_key}"},
                json={
                    "status": status,
                    "consumed_usd": consumed_usd if success else 0,
                },
            )
    except Exception:  # noqa: BLE001
        logger.debug("budget reconcile skipped", exc_info=True)
