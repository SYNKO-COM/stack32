"""Pipedream Connect HTTP client (graceful when credentials are missing)."""

from __future__ import annotations

import logging
import re
import time
from typing import Any

import httpx

from agent_service.config import get_settings

logger = logging.getLogger(__name__)

PIPEDREAM_API_BASE = "https://api.pipedream.com/v1"

_ICON_CACHE: dict[str, str] = {}
_DEFAULT_TIMEOUT = 20.0
_MAX_RETRIES = 2


class PipedreamError(Exception):
    def __init__(self, code: str, message: str = "", *, status: int | None = None) -> None:
        super().__init__(message or code)
        self.code = code
        self.status = status


_RANK_STOPWORDS = frozenset(
    {"a", "an", "and", "for", "from", "in", "my", "of", "on", "the", "to", "with"}
)


def _rank_tokens(query: str) -> list[str]:
    return [
        t
        for t in re.split(r"[^a-z0-9]+", query.lower())
        if t and t not in _RANK_STOPWORDS
    ]


def rank_actions(rows: list[dict[str, Any]], query: str) -> list[dict[str, Any]]:
    """Order an app's actions by how well they answer the query.

    Pipedream returns an app's catalog in its own order, so "Find Emails" —
    the one action an inbox-watching agent needs — came back twelfth out of
    twelve for "gmail", behind signature and alias management. Taking the
    first N actions therefore equipped the agent with everything except the
    thing it was built to do.

    Scoring stays deliberately blunt: count query terms hit in the name, count
    them again at lower weight in the description, and keep Pipedream's order
    for ties. A single-word app query scores every row zero and the original
    order survives untouched.
    """
    tokens = _rank_tokens(query)
    if len(tokens) < 2:
        return rows

    def score(row: dict[str, Any]) -> int:
        name = str(row.get("name") or "").lower()
        summary = str(row.get("summary") or "").lower()
        total = 0
        for token in tokens:
            if token in name:
                total += 3
            elif token in summary:
                total += 1
        return total

    ranked = sorted(enumerate(rows), key=lambda pair: (-score(pair[1]), pair[0]))
    return [row for _, row in ranked]


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
                    "img_src": row.get("img_src") or row.get("icon") or row.get("logo"),
                    "summary": row.get("description") or "",
                    "auth_type": row.get("auth_type") or "oauth",
                    "raw": row,
                }
            )
            slug = str(out[-1]["app_id"] or "").strip().lower()
            src = out[-1].get("img_src")
            if slug and isinstance(src, str) and src.startswith("http"):
                _ICON_CACHE[slug] = src
        return out

    async def list_all_apps(
        self,
        *,
        max_apps: int | None = None,
        page_size: int = 100,
    ) -> list[dict[str, Any]]:
        """Paginate the full Pipedream app catalog (~3000+ apps)."""
        if not self.configured():
            return []
        page_size = min(max(page_size, 1), 100)
        collected: list[dict[str, Any]] = []
        after: str | None = None
        seen_slugs: set[str] = set()

        while True:
            params: dict[str, Any] = {"limit": page_size}
            if after:
                params["after"] = after
            data = await self._request("GET", "/apps", params=params)
            if not isinstance(data, dict):
                break
            rows = data.get("data") or data.get("apps") or []
            if not isinstance(rows, list) or not rows:
                break
            for row in rows:
                if not isinstance(row, dict):
                    continue
                slug = str(row.get("name_slug") or row.get("id") or row.get("name") or "")
                slug = slug.strip().lower().replace("-", "_")
                if not slug or slug in seen_slugs:
                    continue
                seen_slugs.add(slug)
                entry = {
                    "app_id": row.get("name_slug") or row.get("id") or row.get("name"),
                    "name": row.get("name") or row.get("name_slug"),
                    "img_src": row.get("img_src") or row.get("icon") or row.get("logo"),
                    "summary": row.get("description") or "",
                    "auth_type": row.get("auth_type") or "oauth",
                    "raw": row,
                }
                collected.append(entry)
                src = entry.get("img_src")
                if slug and isinstance(src, str) and src.startswith("http"):
                    _ICON_CACHE[slug] = src
                if max_apps and len(collected) >= max_apps:
                    return collected[:max_apps]
            page_info = data.get("page_info") if isinstance(data.get("page_info"), dict) else {}
            next_cursor = page_info.get("end_cursor")
            if not next_cursor or next_cursor == after:
                break
            after = str(next_cursor)
        return collected

    async def icons_for_apps(self, app_ids: list[str]) -> dict[str, str]:
        """Exact app_id → img_src. Cache hits are instant; misses search once."""
        out: dict[str, str] = {}
        missing: list[str] = []
        for raw in app_ids:
            slug = str(raw or "").strip().lower()
            if not slug:
                continue
            cached = _ICON_CACHE.get(slug)
            if cached:
                out[slug] = cached
            else:
                missing.append(slug)
        for slug in missing:
            rows = await self.search_apps(slug, limit=20)
            for row in rows:
                app_id = str(row.get("app_id") or "").strip().lower()
                src = row.get("img_src")
                if app_id and isinstance(src, str) and src.startswith("http"):
                    _ICON_CACHE[app_id] = src
            if slug in _ICON_CACHE:
                out[slug] = _ICON_CACHE[slug]
        return out

    async def _fetch_action_rows(self, query: str, limit: int) -> list[Any]:
        params: dict[str, Any] = {"limit": min(limit, 50)}
        if query:
            params["q"] = query[:200]
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
            return data
        return data.get("data") or data.get("actions") or data.get("components") or []

    async def search_actions(self, query: str, *, limit: int = 20) -> list[dict[str, Any]]:
        if not self.configured():
            return []
        q = query.strip()
        rows = await self._fetch_action_rows(q, limit if " " not in q else 50)
        if not rows and " " in q:
            # Pipedream's `q` filters on the app, not on free text: "gmail" returns
            # the app's catalog while "gmail find email" returns nothing at all.
            # That silence is what left the builder picking whichever actions came
            # back first for the bare app name — signatures and aliases for an
            # agent whose whole job was reading the inbox. Ask for the app, then
            # rank the catalog here.
            rows = await self._fetch_action_rows(q.split()[0], 50)
        if not rows:
            return []
        out: list[dict[str, Any]] = []
        for row in rows:
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
        return rank_actions(out, q)[:limit]

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

    async def reload_props(
        self,
        *,
        action_id: str,
        external_user_id: str,
        configured_props: dict[str, Any] | None = None,
        version: str | None = "latest",
    ) -> dict[str, Any]:
        """Reload dynamic props after setting a reloadProps field (e.g. Canva designType).

        Returns ``{dynamic_props_id, configurable_props}`` or an error dict.
        """
        if not self.configured():
            return {"error": "PIPEDREAM_NOT_CONFIGURED"}
        body: dict[str, Any] = {
            "id": action_id,
            "external_user_id": external_user_id,
            "configured_props": configured_props or {},
        }
        if version:
            body["version"] = version
        data = await self._request(
            "POST",
            f"/connect/{self._project_id()}/actions/props",
            json=body,
        )
        if not isinstance(data, dict):
            return {"error": "PIPEDREAM_RELOAD_PROPS_FAILED"}
        dynamic = data.get("dynamicProps") if isinstance(data.get("dynamicProps"), dict) else {}
        dyp_id = dynamic.get("id")
        props = dynamic.get("configurableProps") or dynamic.get("configurable_props") or []
        if not dyp_id:
            return {
                "error": "PIPEDREAM_RELOAD_PROPS_FAILED",
                "message": "No dynamicProps.id returned",
                "raw_errors": data.get("errors"),
            }
        return {
            "dynamic_props_id": str(dyp_id),
            "configurable_props": props if isinstance(props, list) else [],
        }

    async def run_action(
        self,
        *,
        action_id: str,
        external_user_id: str,
        configured_props: dict[str, Any] | None = None,
        version: str | None = "latest",
        dynamic_props_id: str | None = None,
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
        if dynamic_props_id:
            body["dynamic_props_id"] = dynamic_props_id
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
        # Actions and triggers share the same Connect configure shape; try actions
        # first, then components (triggers / sources).
        for path in (
            f"/connect/{self._project_id()}/actions/configure",
            f"/connect/{self._project_id()}/components/configure",
        ):
            data = await self._request("POST", path, json=body)
            if not data:
                continue
            if isinstance(data, list) and data:
                return data
            if isinstance(data, dict):
                options = (
                    data.get("options") or data.get("data") or data.get("stringOptions") or []
                )
                if isinstance(options, list) and options:
                    return options
        return []

    async def list_accounts(
        self, *, external_user_id: str, app: str | None = None, include_credentials: bool = False
    ) -> list[dict[str, Any]]:
        if not self.configured():
            return []
        params: dict[str, Any] = {"external_user_id": external_user_id}
        if app:
            params["app"] = app
        if include_credentials:
            params["include_credentials"] = "true"
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
            creds = row.get("credentials") if isinstance(row.get("credentials"), dict) else None
            out.append(
                {
                    "id": row.get("id") or row.get("account_id"),
                    "app_id": app_slug,
                    "name": row.get("name") or row.get("healthy") or app_slug,
                    "email": (row.get("metadata") or {}).get("email")
                    if isinstance(row.get("metadata"), dict)
                    else None,
                    "healthy": row.get("healthy"),
                    "credentials": creds,
                    "raw": row,
                }
            )
        return out

    async def get_oauth_access_token_for_app(
        self, *, external_user_id: str, app: str, account_id: str | None = None
    ) -> str | None:
        """Best-effort Google/etc token from a Pipedream connected account (BYOA)."""
        accounts = await self.list_accounts(
            external_user_id=external_user_id, app=app, include_credentials=True
        )
        for account in accounts:
            if account_id and str(account.get("id")) != str(account_id):
                continue
            creds = account.get("credentials") if isinstance(account.get("credentials"), dict) else {}
            token = (
                creds.get("oauth_access_token")
                or creds.get("access_token")
                or creds.get("token")
            )
            if token:
                return str(token)
        return None

    def _component_rows(self, data: dict[str, Any] | list[Any] | None, *, limit: int) -> list[dict[str, Any]]:
        if not data:
            return []
        if isinstance(data, list):
            rows = data
        else:
            rows = data.get("data") or data.get("triggers") or data.get("components") or []
        out: list[dict[str, Any]] = []
        for row in rows[: max(limit, 1)]:
            if not isinstance(row, dict):
                continue
            key = row.get("key") or row.get("id") or row.get("name")
            app = row.get("app")
            app_id = (
                app.get("name_slug")
                if isinstance(app, dict)
                else (app if isinstance(app, str) else row.get("app_id"))
            )
            out.append(
                {
                    "trigger_id": key,
                    "name": row.get("name") or key,
                    "summary": row.get("description") or row.get("summary") or "",
                    "app_id": app_id,
                    "version": row.get("version"),
                    "raw": row,
                }
            )
        return out

    async def search_triggers(
        self,
        query: str = "",
        *,
        app_id: str | None = None,
        limit: int = 40,
    ) -> list[dict[str, Any]]:
        if not self.configured():
            return []
        params: dict[str, Any] = {"limit": min(max(limit, 1), 100), "registry": "all"}
        if query.strip():
            params["q"] = query.strip()[:200]
        if app_id:
            params["app"] = app_id.strip()[:128]
        for path, extra in (
            (f"/connect/{self._project_id()}/triggers", {}),
            (
                f"/connect/{self._project_id()}/components",
                {"componentType": "trigger", "component_type": "trigger"},
            ),
        ):
            try:
                data = await self._request("GET", path, params={**params, **extra})
            except PipedreamError as exc:
                if exc.status == 404:
                    continue
                raise
            rows = self._component_rows(data, limit=limit)
            if rows:
                return rows
        return []

    async def get_trigger_component(self, component_key: str) -> dict[str, Any] | None:
        if not self.configured() or not component_key:
            return None
        for path in (
            f"/connect/{self._project_id()}/triggers/{component_key}",
            f"/connect/{self._project_id()}/components/{component_key}",
            f"/connect/{self._project_id()}/actions/{component_key}",
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
                inner.get("key") or inner.get("configurable_props") or inner.get("name")
            ):
                return inner
        return None

    async def deploy_trigger(
        self,
        *,
        external_user_id: str,
        trigger_id: str,
        configured_props: dict[str, Any] | None = None,
        webhook_url: str,
        emit_on_deploy: bool = False,
    ) -> dict[str, Any]:
        if not self.configured():
            raise PipedreamError("PIPEDREAM_NOT_CONFIGURED")
        body: dict[str, Any] = {
            "external_user_id": external_user_id,
            "id": trigger_id,
            "configured_props": configured_props or {},
            "webhook_url": webhook_url,
            "emit_on_deploy": emit_on_deploy,
        }
        last_error: PipedreamError | None = None
        for path in (
            f"/connect/{self._project_id()}/triggers/deploy",
            f"/connect/{self._project_id()}/components/triggers/deploy",
        ):
            try:
                data = await self._request("POST", path, json=body)
            except PipedreamError as exc:
                last_error = exc
                if exc.status == 404:
                    continue
                raise
            if isinstance(data, dict):
                return data
        if last_error:
            raise last_error
        raise PipedreamError("PIPEDREAM_DEPLOY_FAILED")

    async def delete_deployed_trigger(
        self, *, deployed_id: str, external_user_id: str
    ) -> bool:
        if not self.configured() or not deployed_id:
            return False
        params = {"external_user_id": external_user_id}
        for path in (
            f"/connect/{self._project_id()}/deployed-triggers/{deployed_id}",
            f"/connect/{self._project_id()}/triggers/{deployed_id}",
        ):
            try:
                await self._request("DELETE", path, params=params)
                return True
            except PipedreamError as exc:
                if exc.status == 404:
                    continue
                logger.warning(
                    "pipedream_delete_trigger_failed id=%s status=%s",
                    deployed_id,
                    exc.status,
                )
                return False
        return True

    async def delete_account(self, account_id: str) -> bool:
        """Remove a connected account from Pipedream so sync cannot resurrect it."""
        if not self.configured() or not account_id:
            return False
        try:
            await self._request(
                "DELETE",
                f"/connect/{self._project_id()}/accounts/{account_id}",
            )
            return True
        except PipedreamError as exc:
            if exc.status == 404:
                return True
            logger.warning(
                "pipedream_delete_account_failed id=%s status=%s",
                account_id,
                exc.status,
            )
            return False
        except Exception:  # noqa: BLE001
            logger.exception("pipedream_delete_account_error id=%s", account_id)
            return False
