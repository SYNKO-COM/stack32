"""Pipedream Connect HTTP client (graceful when credentials are missing)."""

from __future__ import annotations

import logging
import time
from typing import Any

import httpx

from agent_service.config import get_settings

logger = logging.getLogger(__name__)

PIPEDREAM_API_BASE = "https://api.pipedream.com/v1"
_DEFAULT_TIMEOUT = 20.0
_MAX_RETRIES = 2


class PipedreamError(Exception):
    def __init__(self, code: str, message: str = "", *, status: int | None = None) -> None:
        super().__init__(message or code)
        self.code = code
        self.status = status


class PipedreamClient:
    """Thin httpx wrapper around Pipedream Connect API."""

    def __init__(self) -> None:
        self._access_token: str | None = None
        self._token_expires_at: float = 0.0

    def configured(self) -> bool:
        settings = get_settings()
        return bool(
            settings.PIPEDREAM_CLIENT_ID
            and settings.PIPEDREAM_CLIENT_SECRET
            and settings.PIPEDREAM_PROJECT_ID
        )

    def _project_id(self) -> str:
        return get_settings().PIPEDREAM_PROJECT_ID

    async def get_access_token(self) -> str | None:
        if not self.configured():
            return None
        if self._access_token and time.time() < self._token_expires_at - 30:
            return self._access_token
        settings = get_settings()
        try:
            async with httpx.AsyncClient(timeout=_DEFAULT_TIMEOUT) as client:
                response = await client.post(
                    f"{PIPEDREAM_API_BASE}/oauth/token",
                    data={
                        "grant_type": "client_credentials",
                        "client_id": settings.PIPEDREAM_CLIENT_ID,
                        "client_secret": settings.PIPEDREAM_CLIENT_SECRET,
                    },
                    headers={"Content-Type": "application/x-www-form-urlencoded"},
                )
            if response.status_code >= 400:
                logger.warning("pipedream_token_failed status=%s", response.status_code)
                return None
            data = response.json()
            self._access_token = str(data.get("access_token") or "")
            expires_in = int(data.get("expires_in") or 3600)
            self._token_expires_at = time.time() + expires_in
            return self._access_token or None
        except Exception:  # noqa: BLE001
            logger.exception("pipedream_token_error")
            return None

    async def _request(
        self,
        method: str,
        path: str,
        *,
        json: dict[str, Any] | None = None,
        params: dict[str, Any] | None = None,
    ) -> dict[str, Any] | list[Any] | None:
        if not self.configured():
            return None
        token = await self.get_access_token()
        if not token:
            return None
        url = path if path.startswith("http") else f"{PIPEDREAM_API_BASE}{path}"
        last_error: Exception | None = None
        for attempt in range(_MAX_RETRIES + 1):
            try:
                async with httpx.AsyncClient(timeout=_DEFAULT_TIMEOUT) as client:
                    response = await client.request(
                        method,
                        url,
                        json=json,
                        params=params,
                        headers={
                            "Authorization": f"Bearer {token}",
                            "Content-Type": "application/json",
                            "x-pd-environment": get_settings().PIPEDREAM_ENVIRONMENT,
                        },
                    )
                if response.status_code == 401 and attempt < _MAX_RETRIES:
                    self._access_token = None
                    token = await self.get_access_token()
                    if not token:
                        return None
                    continue
                if response.status_code >= 400:
                    logger.warning(
                        "pipedream_request_failed method=%s path=%s status=%s",
                        method,
                        path,
                        response.status_code,
                    )
                    raise PipedreamError(
                        "PIPEDREAM_API_FAILED",
                        f"Pipedream API error ({response.status_code})",
                        status=response.status_code,
                    )
                if not response.content:
                    return {}
                return response.json()
            except PipedreamError:
                raise
            except Exception as exc:  # noqa: BLE001
                last_error = exc
                logger.warning("pipedream_request_retry attempt=%s err=%s", attempt, exc)
        if last_error:
            logger.exception("pipedream_request_exhausted")
        return None

    async def create_connect_token(
        self, external_user_id: str, *, app_id: str | None = None
    ) -> dict[str, Any]:
        if not self.configured():
            return {
                "degraded": True,
                "message": "Pipedream credentials not configured.",
                "token": None,
            }
        settings = get_settings()
        body: dict[str, Any] = {
            "external_user_id": external_user_id,
        }
        if settings.PIPEDREAM_ALLOWED_ORIGINS:
            body["allowed_origins"] = settings.PIPEDREAM_ALLOWED_ORIGINS
        data = await self._request(
            "POST",
            f"/connect/{self._project_id()}/tokens",
            json=body,
        )
        if data is None:
            return {"degraded": True, "token": None, "message": "Pipedream unavailable."}
        if isinstance(data, list):
            return {"degraded": True, "token": None}
        # Prefer deep-link into a specific app when Pipedream returns a connect URL.
        if app_id and isinstance(data, dict):
            link = data.get("connect_link_url") or data.get("connectLinkUrl")
            if isinstance(link, str) and link and "app=" not in link:
                sep = "&" if "?" in link else "?"
                data = {**data, "connect_link_url": f"{link}{sep}app={app_id}"}
        return data

    async def search_apps(self, query: str, *, limit: int = 20) -> list[dict[str, Any]]:
        if not self.configured():
            return []
        params: dict[str, Any] = {"limit": min(limit, 50)}
        if query.strip():
            params["q"] = query.strip()[:200]
        data = await self._request("GET", "/apps", params=params)
        if not data:
            return []
        if isinstance(data, list):
            rows = data
        else:
            rows = data.get("data") or data.get("apps") or []
        out: list[dict[str, Any]] = []
        for row in rows[:limit]:
            if not isinstance(row, dict):
                continue
            out.append(
                {
                    "app_id": row.get("name_slug") or row.get("id") or row.get("name"),
                    "name": row.get("name") or row.get("name_slug"),
                    "summary": row.get("description") or "",
                    "auth_type": row.get("auth_type") or "oauth",
                    "raw": row,
                }
            )
        return out

    async def search_actions(self, query: str, *, limit: int = 20) -> list[dict[str, Any]]:
        if not self.configured():
            return []
        params: dict[str, Any] = {"limit": min(limit, 50)}
        if query.strip():
            params["q"] = query.strip()[:200]
        data = await self._request(
            "GET",
            f"/connect/{self._project_id()}/actions",
            params=params,
        )
        if not data:
            # Fallback: components search
            data = await self._request("GET", "/components", params={**params, "q": query})
        if not data:
            return []
        if isinstance(data, list):
            rows = data
        else:
            rows = data.get("data") or data.get("actions") or data.get("components") or []
        out: list[dict[str, Any]] = []
        for row in rows[:limit]:
            if not isinstance(row, dict):
                continue
            key = row.get("key") or row.get("id") or row.get("name")
            out.append(
                {
                    "action_id": key,
                    "name": row.get("name") or key,
                    "summary": row.get("description") or "",
                    "app_id": (row.get("app") or {}).get("name_slug")
                    if isinstance(row.get("app"), dict)
                    else row.get("app"),
                    "version": row.get("version"),
                    "raw": row,
                }
            )
        return out

    async def get_component(self, component_key: str) -> dict[str, Any] | None:
        if not self.configured() or not component_key:
            return None
        # Prefer Connect project-scoped retrieve (includes configurable_props).
        for path in (
            f"/connect/{self._project_id()}/actions/{component_key}",
            f"/connect/{self._project_id()}/components/{component_key}",
            f"/components/{component_key}",
        ):
            try:
                data = await self._request("GET", path)
            except PipedreamError as exc:
                if exc.status == 404:
                    continue
                raise
            if not isinstance(data, dict):
                continue
            inner = data.get("data") if isinstance(data.get("data"), dict) else data
            if isinstance(inner, dict) and (
                inner.get("key")
                or inner.get("configurable_props")
                or inner.get("name")
            ):
                return inner
        return None

    async def run_action(
        self,
        *,
        action_id: str,
        external_user_id: str,
        configured_props: dict[str, Any] | None = None,
        version: str | None = "latest",
    ) -> dict[str, Any]:
        """Run a Connect action. Auth must already be inside configured_props.<app>.authProvisionId."""
        if not self.configured():
            return {
                "degraded": True,
                "error": "PIPEDREAM_NOT_CONFIGURED",
                "message": "Pipedream credentials not configured.",
            }
        body: dict[str, Any] = {
            "id": action_id,
            "external_user_id": external_user_id,
            "configured_props": configured_props or {},
        }
        if version:
            body["version"] = version
        try:
            data = await self._request(
                "POST",
                f"/connect/{self._project_id()}/actions/run",
                json=body,
            )
        except PipedreamError as exc:
            return {"error": exc.code, "message": str(exc), "status": exc.status}
        if data is None:
            return {"degraded": True, "error": "PIPEDREAM_UNAVAILABLE"}
        if isinstance(data, list):
            return {"result": data}
        return data

    async def configure_prop(
        self,
        *,
        action_id: str,
        prop_name: str,
        external_user_id: str,
        configured_props: dict[str, Any] | None = None,
        version: str | None = "latest",
    ) -> list[Any]:
        """Fetch dynamic options for a component prop via Connect configuration API."""
        if not self.configured():
            return []
        body: dict[str, Any] = {
            "id": action_id,
            "external_user_id": external_user_id,
            "prop_name": prop_name,
            "configured_props": configured_props or {},
        }
        if version:
            body["version"] = version
        data = await self._request(
            "POST",
            f"/connect/{self._project_id()}/actions/configure",
            json=body,
        )
        if not data:
            return []
        if isinstance(data, list):
            return data
        options = data.get("options") or data.get("data") or data.get("stringOptions") or []
        return options if isinstance(options, list) else []

    async def list_accounts(
        self, *, external_user_id: str, app: str | None = None
    ) -> list[dict[str, Any]]:
        if not self.configured():
            return []
        params: dict[str, Any] = {"external_user_id": external_user_id}
        if app:
            params["app"] = app
        data = await self._request(
            "GET",
            f"/connect/{self._project_id()}/accounts",
            params=params,
        )
        if not data:
            return []
        if isinstance(data, list):
            rows = [r for r in data if isinstance(r, dict)]
        else:
            rows = [
                r
                for r in (data.get("data") or data.get("accounts") or [])
                if isinstance(r, dict)
            ]
        # Normalize safe fields for Stack32 sync
        out: list[dict[str, Any]] = []
        for row in rows:
            app_info = row.get("app") if isinstance(row.get("app"), dict) else {}
            app_slug = (
                app_info.get("name_slug")
                or app_info.get("nameSlug")
                or row.get("app")
                or row.get("app_id")
            )
            out.append(
                {
                    "id": row.get("id") or row.get("account_id"),
                    "app_id": app_slug,
                    "name": row.get("name") or row.get("healthy") or app_slug,
                    "email": (row.get("metadata") or {}).get("email")
                    if isinstance(row.get("metadata"), dict)
                    else None,
                    "healthy": row.get("healthy"),
                    "raw": row,
                }
            )
        return out
