"""Persistent Supabase cache for Pipedream component definitions."""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from typing import Any, Literal

from agent_service.supabase_client import get_supabase_admin_client

logger = logging.getLogger(__name__)

DEFAULT_TTL_DAYS = 7
ComponentType = Literal["action", "trigger"]


def _is_fresh(fetched_at: str | None, *, ttl_days: int = DEFAULT_TTL_DAYS) -> bool:
    if not fetched_at:
        return False
    try:
        ts = datetime.fromisoformat(str(fetched_at).replace("Z", "+00:00"))
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=UTC)
        return datetime.now(UTC) - ts < timedelta(days=ttl_days)
    except ValueError:
        return False


async def get_cached_component(
    component_key: str,
    *,
    component_type: ComponentType = "action",
    ttl_days: int = DEFAULT_TTL_DAYS,
) -> dict[str, Any] | None:
    """Return cached component payload if fresh enough."""
    key = str(component_key or "").strip().removeprefix("pd:")
    if not key:
        return None
    try:
        async with get_supabase_admin_client() as sb:
            response = await sb.get(
                "/pipedream_component_cache",
                params={
                    "component_key": f"eq.{key}",
                    "component_type": f"eq.{component_type}",
                    "select": "payload,fetched_at",
                    "limit": "1",
                },
            )
            if response.status_code >= 400:
                return None
            rows = response.json() or []
            if not rows or not isinstance(rows[0], dict):
                return None
            row = rows[0]
            if not _is_fresh(row.get("fetched_at"), ttl_days=ttl_days):
                return None
            payload = row.get("payload")
            return dict(payload) if isinstance(payload, dict) else None
    except Exception:  # noqa: BLE001
        logger.debug("component_cache_get_failed key=%s", key, exc_info=True)
        return None


async def put_cached_component(
    component_key: str,
    payload: dict[str, Any],
    *,
    component_type: ComponentType = "action",
    app_id: str | None = None,
    version: str | None = None,
) -> None:
    """Upsert a component payload into the persistent cache."""
    key = str(component_key or "").strip().removeprefix("pd:")
    if not key or not payload:
        return
    app = str(app_id or "").strip() or None
    if not app:
        app_obj = payload.get("app")
        if isinstance(app_obj, dict):
            app = str(app_obj.get("name_slug") or app_obj.get("nameSlug") or "") or None
        elif isinstance(app_obj, str):
            app = app_obj
    ver = str(version or payload.get("version") or "") or None
    now = datetime.now(UTC).isoformat()
    body = {
        "component_key": key,
        "component_type": component_type,
        "app_id": app,
        "version": ver,
        "payload": payload,
        "fetched_at": now,
    }
    try:
        async with get_supabase_admin_client() as sb:
            existing = await sb.get(
                "/pipedream_component_cache",
                params={
                    "component_key": f"eq.{key}",
                    "component_type": f"eq.{component_type}",
                    "select": "component_key",
                    "limit": "1",
                },
            )
            rows = existing.json() if existing.status_code < 400 else []
            if rows:
                await sb.patch(
                    "/pipedream_component_cache",
                    params={
                        "component_key": f"eq.{key}",
                        "component_type": f"eq.{component_type}",
                    },
                    json=body,
                )
            else:
                await sb.post("/pipedream_component_cache", json=body)
    except Exception:  # noqa: BLE001
        logger.debug("component_cache_put_failed key=%s", key, exc_info=True)
