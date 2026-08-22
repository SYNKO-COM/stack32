"""Stable per-app keys — never collapse a suite (Google, Microsoft) into one app."""

from __future__ import annotations

SUITE_APP_IDS = frozenset(
    {
        "google",
        "microsoft",
        "microsoft_365",
        "microsoft365",
        "office",
        "office365",
        "ms",
        "ms365",
    }
)

# Native / well-known prefixes → product app (not the suite).
_APP_PREFIXES: tuple[tuple[str, str], ...] = (
    ("gmail", "gmail"),
    ("calendar_", "google_calendar"),
    ("calendar", "google_calendar"),
    ("google_docs", "google_docs"),
    ("google-docs", "google_docs"),
    ("google_sheets", "google_sheets"),
    ("google-sheets", "google_sheets"),
    ("google_drive", "google_drive"),
    ("google-drive", "google_drive"),
    ("google_slides", "google_slides"),
    ("microsoft_outlook", "microsoft_outlook"),
    ("outlook", "microsoft_outlook"),
    ("microsoft_teams", "microsoft_teams"),
    ("onedrive", "onedrive"),
    ("one_drive", "onedrive"),
)

_APP_TOOLS: dict[str, tuple[str, ...]] = {
    "gmail": (
        "gmail_list",
        "gmail_read",
        "gmail_create_draft",
        "gmail_send_message",
        "gmail_send",
    ),
    "google_calendar": ("calendar_list", "calendar_create_event"),
    "google_docs": ("google_docs_create", "google_docs_append"),
    "google_sheets": (),
    "google_drive": (),
}

_ALIAS_TO_APP = {
    "gmail": "gmail",
    "email": "gmail",
    "mail": "gmail",
    "calendar": "google_calendar",
    "google_calendar": "google_calendar",
    "docs": "google_docs",
    "google_docs": "google_docs",
    "sheets": "google_sheets",
    "google_sheets": "google_sheets",
    "drive": "google_drive",
    "google_drive": "google_drive",
}


def app_key_from_tool_id(tool_id: str, *, app_id: str | None = None) -> str:
    """Return the product app key for a tool. Suite ids like `google` are ignored."""
    tid = (tool_id or "").lower().strip()
    stripped = tid.replace("pd:", "").replace("pipedream:", "")
    for prefix, key in _APP_PREFIXES:
        if stripped == prefix.rstrip("_") or stripped.startswith(prefix):
            return key
    raw_app = (app_id or "").lower().strip()
    if raw_app and raw_app not in SUITE_APP_IDS:
        return raw_app
    if tid.startswith("pd:") or tid.startswith("pipedream:"):
        slug = stripped.split("-")[0]
        if slug and slug not in SUITE_APP_IDS:
            return slug
    return stripped or raw_app or tid


def oauth_provider_for_app(app_key: str) -> str:
    """OAuth/connect provider for a product app.

    Google product apps (Gmail, Calendar, Docs, …) connect via Pipedream so each
    app can bind a distinct Google account without Stack32's Google OAuth client.
    """
    key = (app_key or "").lower()
    if key in {
        "gmail",
        "google_calendar",
        "google_docs",
        "google_sheets",
        "google_drive",
        "google_slides",
        "google",
    }:
        return "pipedream"
    if key in {
        "microsoft_outlook",
        "outlook",
        "microsoft_teams",
        "onedrive",
        "microsoft_excel",
        "sharepoint",
        "microsoft",
    }:
        return "microsoft"
    return key


def expand_bind_tool_ids(tool_ids: list[str] | None) -> list[str]:
    """Expand aliases (`gmail`) to concrete tool ids; keep exact ids as-is."""
    out: list[str] = []
    seen: set[str] = set()
    for raw in tool_ids or []:
        token = str(raw or "").strip()
        if not token:
            continue
        app = _ALIAS_TO_APP.get(token.lower())
        expanded = list(_APP_TOOLS.get(app or "", ())) if app else []
        if not expanded and token.lower() in _APP_TOOLS:
            expanded = list(_APP_TOOLS[token.lower()])
        pool = expanded or [token]
        for tid in pool:
            if tid not in seen:
                seen.add(tid)
                out.append(tid)
    return out


def is_same_pipedream_app(tool_id: str, enabled_tool_ids: list[str] | set[str]) -> bool:
    """True when tool_id is a Pipedream action from an app already enabled on the agent."""
    tid = (tool_id or "").strip()
    if not tid.startswith("pd:"):
        return False
    app = app_key_from_tool_id(tid)
    if not app or app in SUITE_APP_IDS:
        return False
    for other in enabled_tool_ids:
        other_tid = str(other or "").strip()
        if other_tid.startswith("pd:") and app_key_from_tool_id(other_tid) == app:
            return True
    return False


def app_keys_for_tool_ids(tool_ids: list[str]) -> list[str]:
    keys: list[str] = []
    seen: set[str] = set()
    for tid in tool_ids:
        key = app_key_from_tool_id(tid)
        if key and key not in seen and key not in SUITE_APP_IDS:
            seen.add(key)
            keys.append(key)
    return keys


def tool_ids_from_scopes(scopes: list[str]) -> list[str]:
    """Best-effort reverse map when oauth state has no tool_ids column yet."""
    joined = " ".join(scopes or [])
    out: list[str] = []
    if "gmail" in joined:
        out.extend(_APP_TOOLS["gmail"])
    if "calendar" in joined:
        out.extend(_APP_TOOLS["google_calendar"])
    if "documents" in joined or "drive.file" in joined:
        out.extend(_APP_TOOLS["google_docs"])
    return list(dict.fromkeys(out))
