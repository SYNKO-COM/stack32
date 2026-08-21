"""Mandatory human confirmation before any tool add/remove."""

from __future__ import annotations

from typing import Any

from agent_service.integrations.app_keys import app_key_from_tool_id
from agent_service.models.agent_spec import ToolBinding

# Always present, never shown in the review UI (same set as Structure).
HIDDEN_FROM_REVIEW = frozenset(
    {
        "current_datetime",
        "structured_output",
        "calculator",
        "fetch_url",
        "web_search",
        "knowledge_search",
        "http_request",
    }
)

# Back-compat alias used by older tests / imports.
PROTECTED_TOOL_IDS = HIDDEN_FROM_REVIEW

_APP_DISPLAY_NAMES = {
    "gmail": "Gmail",
    "google_calendar": "Google Calendar",
    "google_docs": "Google Docs",
    "google_sheets": "Google Sheets",
    "google_drive": "Google Drive",
    "google_slides": "Google Slides",
    "microsoft_outlook": "Outlook",
    "outlook": "Outlook",
    "microsoft_teams": "Microsoft Teams",
    "onedrive": "OneDrive",
    "hubspot": "HubSpot",
    "salesforce": "Salesforce",
    "slack": "Slack",
    "slack_v2": "Slack",
    "canva": "Canva",
    "notion": "Notion",
    "stripe": "Stripe",
    "linear": "Linear",
    "airtable": "Airtable",
}


def _is_reviewable(tool: ToolBinding) -> bool:
    return bool(tool.enabled) and tool.tool_id not in HIDDEN_FROM_REVIEW


def _app_key(tool: ToolBinding) -> str:
    return app_key_from_tool_id(tool.tool_id, app_id=tool.app_id)


def reviewable_app_keys(tools: list[ToolBinding] | None) -> set[str]:
    return {_app_key(t) for t in (tools or []) if _is_reviewable(t)}


def enabled_tool_ids(tools: list[ToolBinding] | None) -> set[str]:
    return {t.tool_id for t in (tools or []) if _is_reviewable(t)}


def tools_changed(
    *,
    proposed: list[ToolBinding],
    current: list[ToolBinding] | None,
) -> bool:
    """True when the reviewable (Pipedream / product) app set differs."""
    proposed_keys = reviewable_app_keys(proposed)
    if current is None:
        return bool(proposed_keys)
    return proposed_keys != reviewable_app_keys(current)


def _title_case(slug: str) -> str:
    raw = (slug or "tool").replace("_", " ").replace("-", " ")
    return " ".join(part.capitalize() for part in raw.split() if part)[:80]


def _app_display_name(app_key: str, tool: ToolBinding) -> str:
    key = (app_key or "").lower()
    if key in _APP_DISPLAY_NAMES:
        return _APP_DISPLAY_NAMES[key]
    if tool.app_id and tool.app_id.lower() not in {"pipedream", "pd", "native"}:
        return _title_case(tool.app_id)
    return _title_case(app_key or tool.tool_id)


def default_utility(
    tool: ToolBinding,
    *,
    change: str,
    goal: str = "",
    locale: str = "en",
    name: str | None = None,
) -> str:
    cfg = tool.config if isinstance(tool.config, dict) else {}
    for key in ("utility", "purpose", "reason"):
        value = cfg.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()[:500]
    label = name or _app_display_name(_app_key(tool), tool)
    french = str(locale or "en").lower().startswith("fr")
    goal_bit = (goal or "").strip()
    if change == "remove":
        if french:
            return f"Stack32 propose de retirer {label}."
        return f"Stack32 proposes removing {label} from this agent."
    if french:
        if goal_bit:
            return (
                f"{label} sert à avancer sur cet objectif : {goal_bit[:140]}. "
                "L’agent l’utilise pour lire, créer ou envoyer ce qu’il faut."
            )[:500]
        return (
            f"L’agent utilise {label} pour faire son travail "
            "(lire, créer ou envoyer ce qu’il faut)."
        )
    if goal_bit:
        return (
            f"{label} helps with: {goal_bit[:140]}. "
            "The agent uses it to read, create, or send what it needs."
        )[:500]
    return f"The agent uses {label} to get its job done."


def _group_tools(tools: list[ToolBinding]) -> dict[str, list[ToolBinding]]:
    groups: dict[str, list[ToolBinding]] = {}
    for tool in tools:
        if not _is_reviewable(tool):
            continue
        groups.setdefault(_app_key(tool), []).append(tool)
    return groups


def build_tool_review_entries(
    *,
    proposed: list[ToolBinding],
    current: list[ToolBinding] | None,
    goal: str = "",
    locale: str = "en",
) -> list[dict[str, Any]]:
    """One UI row per product app (not per Pipedream action)."""
    current_groups = _group_tools(list(current or []))
    proposed_groups = _group_tools(proposed)

    entries: list[dict[str, Any]] = []
    for app_key, tools in proposed_groups.items():
        current_ids = {t.tool_id for t in current_groups.get(app_key, [])}
        proposed_ids = {t.tool_id for t in tools}
        if current_ids and proposed_ids <= current_ids:
            change = "keep"
        else:
            change = "add"
        primary = tools[0]
        name = _app_display_name(app_key, primary)
        entries.append(
            {
                "tool_id": primary.tool_id,
                "tool_ids": [t.tool_id for t in tools],
                "name": name,
                "provider": primary.provider or "pipedream",
                "app_id": primary.app_id or app_key,
                "external_action_id": primary.external_action_id,
                "utility": default_utility(
                    primary, change=change, goal=goal, locale=locale, name=name
                ),
                "change": change,
                "removable": True,
            }
        )

    for app_key, tools in current_groups.items():
        if app_key in proposed_groups:
            continue
        primary = tools[0]
        name = _app_display_name(app_key, primary)
        entries.append(
            {
                "tool_id": primary.tool_id,
                "tool_ids": [t.tool_id for t in tools],
                "name": name,
                "provider": primary.provider or "pipedream",
                "app_id": primary.app_id or app_key,
                "external_action_id": primary.external_action_id,
                "utility": default_utility(
                    primary, change="remove", goal=goal, locale=locale, name=name
                ),
                "change": "remove",
                "removable": True,
            }
        )

    order = {"add": 0, "keep": 1, "remove": 2}
    entries.sort(key=lambda e: (order.get(str(e.get("change")), 9), str(e.get("name") or "")))
    return entries


def _pending_matches(pending: list[ToolBinding], raw: dict[str, Any]) -> list[ToolBinding]:
    tool_id = str(raw.get("tool_id") or "").strip()
    app_id = str(raw.get("app_id") or "").strip() or None
    raw_ids = raw.get("tool_ids")
    wanted: set[str] = set()
    if isinstance(raw_ids, list):
        wanted = {str(x).strip() for x in raw_ids if str(x).strip()}
    if wanted:
        hits = [t for t in pending if t.tool_id in wanted]
        if hits:
            return hits
    if app_id:
        key = app_key_from_tool_id(tool_id or app_id, app_id=app_id)
        hits = [t for t in pending if _is_reviewable(t) and _app_key(t) == key]
        if hits:
            return hits
    if tool_id:
        hits = [t for t in pending if t.tool_id == tool_id]
        if hits:
            return hits
    return []


def apply_reviewed_tools(
    *,
    pending_tools: list[ToolBinding],
    reviewed: list[dict[str, Any]],
) -> list[ToolBinding]:
    """Apply the user's confirmed apps onto the pending bindings."""
    out: list[ToolBinding] = []
    seen: set[str] = set()

    for tool in pending_tools:
        if tool.tool_id in HIDDEN_FROM_REVIEW and tool.tool_id not in seen:
            seen.add(tool.tool_id)
            out.append(tool)

    for raw in reviewed:
        tool_id = str(raw.get("tool_id") or "").strip()
        if tool_id in HIDDEN_FROM_REVIEW:
            continue
        utility = str(raw.get("utility") or "").strip()[:500]
        matches = _pending_matches(pending_tools, raw)
        if not matches and tool_id and not tool_id.startswith("app:"):
            provider = str(raw.get("provider") or "pipedream")[:64]
            app_id = raw.get("app_id")
            if app_id is not None:
                app_id = str(app_id).strip()[:128] or None
            matches = [
                ToolBinding(
                    tool_id=tool_id[:128],
                    provider=provider or "pipedream",
                    app_id=app_id,
                    external_action_id=(
                        str(raw.get("external_action_id")).strip()[:256]
                        if raw.get("external_action_id")
                        else None
                    ),
                    enabled=True,
                    config={"utility": utility} if utility else {},
                )
            ]

        for base in matches:
            if base.tool_id in seen:
                continue
            config: dict[str, Any] = dict(base.config) if isinstance(base.config, dict) else {}
            if utility:
                config["utility"] = utility
            provider = str(raw.get("provider") or base.provider or "pipedream")[:64]
            app_id = raw.get("app_id")
            if app_id is not None:
                app_id = str(app_id).strip()[:128] or None
            else:
                app_id = base.app_id
            out.append(
                base.model_copy(
                    update={
                        "enabled": True,
                        "provider": provider,
                        "app_id": app_id,
                        "config": config,
                    }
                )
            )
            seen.add(base.tool_id)

    for bid in ("current_datetime", "structured_output"):
        if bid not in seen:
            out.insert(0, ToolBinding(tool_id=bid, provider="native", enabled=True))
            seen.add(bid)

    return out[:40]
