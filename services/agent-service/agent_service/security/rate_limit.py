"""PostgreSQL-backed rate limiting and budget checks."""

from __future__ import annotations

import logging

from agent_service.config import get_settings

logger = logging.getLogger(__name__)


class RateLimitExceeded(Exception):
    def __init__(self, code: str = "RUN_LIMIT_REACHED") -> None:
        self.code = code
        super().__init__(code)


class BudgetExceeded(Exception):
    def __init__(self) -> None:
        self.code = "MODEL_BUDGET_EXCEEDED"
        super().__init__(self.code)


async def check_user_rate_limit(user_id: str) -> None:
    settings = get_settings()
    if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_ROLE_KEY:
        if settings.ENVIRONMENT in {"production", "production-like"}:
            raise RateLimitExceeded("RATE_LIMIT_UNAVAILABLE")
        return
    try:
        from agent_service.supabase_client import get_supabase_admin_client

        async with get_supabase_admin_client() as client:
            response = await client.post(
                "/rpc/consume_rate_limit",
                json={
                    "p_bucket_key": f"user:{user_id}:rpm",
                    "p_limit": settings.RATE_LIMIT_PER_USER_PER_MINUTE,
                    "p_window_seconds": 60,
                },
            )
        if response.status_code >= 400:
            if settings.ENVIRONMENT in {"production", "production-like"}:
                raise RateLimitExceeded("RATE_LIMIT_UNAVAILABLE")
            logger.warning("rate limit rpc failed status=%s", response.status_code)
            return
        if response.json() is False:
            raise RateLimitExceeded()
    except RateLimitExceeded:
        raise
    except Exception as exc:  # noqa: BLE001
        if settings.ENVIRONMENT in {"production", "production-like"}:
            logger.error("rate limit check failed closed: %s", type(exc).__name__)
            raise RateLimitExceeded("RATE_LIMIT_UNAVAILABLE") from exc
        logger.debug("rate limit check skipped")


async def check_ip_rate_limit(ip_hash: str | None) -> None:
    if not ip_hash:
        return
    settings = get_settings()
    if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_ROLE_KEY:
        return
    try:
        from agent_service.supabase_client import get_supabase_admin_client

        async with get_supabase_admin_client() as client:
            response = await client.post(
                "/rpc/consume_rate_limit",
                json={
                    "p_bucket_key": f"ip:{ip_hash}:rpm",
                    "p_limit": settings.RATE_LIMIT_PER_IP_PER_MINUTE,
                    "p_window_seconds": 60,
                },
            )
        if response.status_code < 400 and response.json() is False:
            raise RateLimitExceeded()
    except RateLimitExceeded:
        raise
    except Exception:  # noqa: BLE001
        logger.debug("ip rate limit check skipped")


async def check_monthly_budget(user_id: str) -> None:
    """Enforce plan period budget (monthly or annual pool) from entitlements."""
    settings = get_settings()
    if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_ROLE_KEY:
        if settings.ENVIRONMENT in {"production", "production-like"}:
            raise BudgetExceeded()
        return
    try:
        from agent_service.supabase_client import get_supabase_admin_client

        async with get_supabase_admin_client() as client:
            response = await client.post(
                "/rpc/assert_period_budget_available",
                json={"p_user_id": user_id},
            )
            if response.status_code < 400:
                if response.json() is False:
                    raise BudgetExceeded()
                return

            # Fallback to status RPC if assert is not yet migrated.
            status = await client.post(
                "/rpc/user_period_budget_status",
                json={"p_user_id": user_id},
            )
            if status.status_code < 400:
                payload = status.json() or {}
                if isinstance(payload, dict) and payload.get("exceeded"):
                    raise BudgetExceeded()
                return

            if settings.ENVIRONMENT in {"production", "production-like"}:
                raise BudgetExceeded()
            logger.warning("budget rpc unavailable status=%s", response.status_code)
    except BudgetExceeded:
        raise
    except Exception as exc:  # noqa: BLE001
        if settings.ENVIRONMENT in {"production", "production-like"}:
            logger.error("budget check failed closed: %s", type(exc).__name__)
            raise BudgetExceeded() from exc
        logger.debug("budget check skipped")


async def check_installation_rate_limit(installation_id: str | None) -> None:
    if not installation_id:
        return
    settings = get_settings()
    if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_ROLE_KEY:
        return
    try:
        from agent_service.supabase_client import get_supabase_admin_client

        async with get_supabase_admin_client() as client:
            response = await client.post(
                "/rpc/consume_rate_limit",
                json={
                    "p_bucket_key": f"installation:{installation_id}:rpm",
                    "p_limit": settings.RATE_LIMIT_PER_USER_PER_MINUTE,
                    "p_window_seconds": 60,
                },
            )
        if response.status_code < 400 and response.json() is False:
            raise RateLimitExceeded()
    except RateLimitExceeded:
        raise
    except Exception:  # noqa: BLE001
        logger.debug("installation rate limit check skipped")


async def check_concurrent_runs(
    *,
    user_id: str,
    kind: str,
) -> None:
    """Enforce MAX_CONCURRENT_* against active runs for the user."""
    settings = get_settings()
    limit = (
        settings.MAX_CONCURRENT_BUILDER_RUNS
        if kind == "builder"
        else settings.MAX_CONCURRENT_LIVE_RUNS
    )
    if limit <= 0:
        return
    if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_ROLE_KEY:
        return
    try:
        from agent_service.supabase_client import get_supabase_admin_client

        async with get_supabase_admin_client() as client:
            response = await client.get(
                "/agent_runs",
                params={
                    "user_id": f"eq.{user_id}",
                    "status": "in.(queued,running,pending)",
                    "select": "id",
                    "limit": str(limit + 1),
                },
            )
        if response.status_code < 400:
            rows = response.json() or []
            if len(rows) >= limit:
                raise RateLimitExceeded("CONCURRENT_RUN_LIMIT")
    except RateLimitExceeded:
        raise
    except Exception:  # noqa: BLE001
        logger.debug("concurrent run check skipped")
