"""Mandatory human confirmation before any tool add/remove."""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from agent_service.gateway.model_gateway import ModelProfile
from agent_service.integrations.app_keys import app_key_from_tool_id
from agent_service.models.agent_spec import ToolBinding

logger = logging.getLogger(__name__)

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


_APP_UTILITY_HINTS_FR: dict[str, str] = {
    "gmail": "Lire, trier et rédiger des e-mails pour avancer sur l’objectif.",
    "microsoft_outlook": "Lire et envoyer des e-mails Outlook liés à l’objectif.",
    "outlook": "Lire et envoyer des e-mails Outlook liés à l’objectif.",
    "google_calendar": "Consulter l’agenda et créer ou mettre à jour des événements.",
    "google_sheets": "Lire et mettre à jour des feuilles de calcul pour suivre les infos.",
    "google_docs": "Créer ou compléter des documents Google Docs utiles à l’objectif.",
    "google_drive": "Retrouver et organiser des fichiers dans Google Drive.",
    "google_slides": "Préparer ou mettre à jour des présentations.",
    "slack": "Lire et envoyer des messages Slack utiles à l’objectif.",
    "notion": "Lire et mettre à jour des pages Notion liées à l’objectif.",
    "hubspot": "Consulter et mettre à jour les contacts / deals HubSpot.",
    "salesforce": "Consulter et mettre à jour les fiches Salesforce.",
    "pipedrive": "Suivre les deals et contacts dans Pipedrive.",
    "stripe": "Consulter paiements, clients ou factures Stripe.",
    "canva": "Créer ou adapter des designs Canva.",
    "linear": "Lire et créer des tickets Linear.",
    "airtable": "Lire et mettre à jour des bases Airtable.",
}

_APP_UTILITY_HINTS_EN: dict[str, str] = {
    "gmail": "Read, sort, and draft emails that move the goal forward.",
    "microsoft_outlook": "Read and send Outlook emails related to the goal.",
    "outlook": "Read and send Outlook emails related to the goal.",
    "google_calendar": "Check the calendar and create or update events.",
    "google_sheets": "Read and update spreadsheets to track the needed data.",
    "google_docs": "Create or update Google Docs that support the goal.",
    "google_drive": "Find and organize files in Google Drive.",
    "google_slides": "Prepare or update slide decks.",
    "slack": "Read and send Slack messages useful for the goal.",
    "notion": "Read and update Notion pages related to the goal.",
    "hubspot": "Look up and update HubSpot contacts or deals.",
    "salesforce": "Look up and update Salesforce records.",
    "pipedrive": "Track deals and contacts in Pipedrive.",
    "stripe": "Check Stripe payments, customers, or invoices.",
    "canva": "Create or adapt Canva designs.",
    "linear": "Read and create Linear issues.",
    "airtable": "Read and update Airtable bases.",
}


def is_generic_utility(text: str) -> bool:
    lower = (text or "").strip().lower()
    if not lower:
        return True
    markers = (
        "lets the agent use",
        "toward:",
        "sert à avancer sur cet objectif",
        "l’agent l’utilise pour lire, créer ou envoyer",
        "l'agent l'utilise pour lire, créer ou envoyer",
        "to read, create, or send what it needs",
        "to get its job done",
        "help the user achieve their goal",
    )
    return any(m in lower for m in markers)


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
        if isinstance(value, str) and value.strip() and not is_generic_utility(value):
            return value.strip()[:500]
    label = name or _app_display_name(_app_key(tool), tool)
    french = str(locale or "en").lower().startswith("fr")
    goal_bit = (goal or "").strip()
    app_key = _app_key(tool).lower()
    if change == "remove":
        if french:
            return f"Stack32 propose de retirer {label}."
        return f"Stack32 proposes removing {label} from this agent."
    hint = (_APP_UTILITY_HINTS_FR if french else _APP_UTILITY_HINTS_EN).get(app_key)
    if hint:
        if goal_bit:
            suffix = (
                f" Pour : {goal_bit[:120]}."
                if french
                else f" For: {goal_bit[:120]}."
            )
            return f"{hint}{suffix}"[:500]
        return hint[:500]
    if french:
        if goal_bit:
            return f"{label} aide l’agent sur : {goal_bit[:160]}."[:500]
        return f"L’agent s’appuie sur {label} pour avancer sur sa mission."
    if goal_bit:
        return f"{label} helps the agent with: {goal_bit[:160]}."[:500]
    return f"The agent uses {label} to advance its mission."


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


async def enrich_utilities_with_llm(
    entries: list[dict[str, Any]],
    *,
    goal: str,
    locale: str = "en",
    gateway: Any | None = None,
) -> list[dict[str, Any]]:
    """Ask the builder LLM for a specific 1–2 sentence utility per proposed app."""
    # Always rewrite agent-proposed adds; keep existing utilities only when already specific
    # (e.g. user confirmed earlier) and not a template fallback.
    targets = [
        e
        for e in entries
        if str(e.get("change") or "") == "add"
        or (
            str(e.get("change") or "") == "keep"
            and is_generic_utility(str(e.get("utility") or ""))
        )
    ]
    if not targets or gateway is None:
        return entries

    french = str(locale or "en").lower().startswith("fr")
    lang = "French" if french else "English"
    app_lines = "\n".join(
        f"- {e.get('app_id')}: {e.get('name')}" for e in targets if e.get("app_id")
    )
    goal_bit = (goal or "").strip()[:600]
    try:
        result = await gateway.complete(
            profile=ModelProfile.FAST,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You explain why each app belongs on this AI agent.\n"
                        f"Write in {lang}.\n"
                        "Return ONLY a JSON object mapping app_id → utility string.\n"
                        "Each utility: 1 or 2 short sentences, concrete, specific to THIS goal.\n"
                        "No marketing, no filler, no repeated generic phrases like "
                        "\"help the user achieve their goal\" or \"read, create or send\".\n"
                        "Example: "
                        '{"gmail":"Lire les e-mails entrants des leads et préparer une réponse personnalisée."}'
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        f"Agent goal:\n{goal_bit or '(not specified)'}\n\n"
                        f"Apps to explain:\n{app_lines}\n"
                    ),
                },
            ],
            temperature=0.3,
            max_tokens=500,
        )
        raw = (getattr(result, "content", None) or "").strip()
        if not raw:
            return entries
        match = re.search(r"\{[\s\S]*\}", raw)
        payload = json.loads(match.group(0) if match else raw)
        if not isinstance(payload, dict):
            return entries
        by_id = {str(k).strip().lower(): str(v).strip() for k, v in payload.items() if v}
        for entry in targets:
            app_id = str(entry.get("app_id") or "").strip().lower()
            name = str(entry.get("name") or "").strip().lower()
            text = by_id.get(app_id) or by_id.get(name)
            if text and not is_generic_utility(text):
                entry["utility"] = text[:500]
    except Exception:  # noqa: BLE001
        logger.exception("tool_review_utility_llm_failed")
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
