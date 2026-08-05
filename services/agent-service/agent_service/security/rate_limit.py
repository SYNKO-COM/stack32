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
        if response.status_code < 400 and response.json() is False:
            raise RateLimitExceeded()
    except RateLimitExceeded:
        raise
    except Exception:  # noqa: BLE001
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
    settings = get_settings()
    if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_ROLE_KEY:
        return
    try:
        from agent_service.supabase_client import get_supabase_admin_client

        async with get_supabase_admin_client() as client:
            response = await client.post(
                "/rpc/user_monthly_usage_usd",
                json={"p_user_id": user_id},
            )
        if response.status_code >= 400:
            return
        used_f = float(response.json() or 0)
        if used_f >= settings.MONTHLY_USER_BUDGET_USD:
            raise BudgetExceeded()
    except BudgetExceeded:
        raise
    except Exception:  # noqa: BLE001
        logger.debug("budget check skipped")
