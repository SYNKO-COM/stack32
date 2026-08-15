"""Pipedream knowledge + app hints for Stack32 Builder / runtime.

Loads curated docs under ``docs/pipedream`` so the orchestrator can reason about
Connect auth props, dynamic props, and app-specific configuration (Notion page,
Slack channel, Canva designType, etc.) without hardcoding every agent.
"""

from __future__ import annotations

import json
import logging
from functools import lru_cache
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# Repo root: services/agent-service/agent_service/integrations/pipedream/knowledge.py
# -> parents[5] = Stack32/
_REPO_ROOT = Path(__file__).resolve().parents[5]
_DOCS_DIR = _REPO_ROOT / "docs" / "pipedream"
_HINTS_PATH = _DOCS_DIR / "app_hints.json"
_KNOWLEDGE_PATH = _DOCS_DIR / "CONNECT_KNOWLEDGE.md"


@lru_cache(maxsize=1)
def load_connect_knowledge_markdown() -> str:
    try:
        return _KNOWLEDGE_PATH.read_text(encoding="utf-8")
    except OSError:
        logger.warning("pipedream_knowledge_missing path=%s", _KNOWLEDGE_PATH)
        return (
            "Pipedream Connect: use exact app prop names, pass dynamic_props_id after "
            "reloadProps, never let the model set authProvisionId."
        )


@lru_cache(maxsize=1)
def load_app_hints() -> dict[str, Any]:
    try:
        raw = json.loads(_HINTS_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        logger.warning("pipedream_app_hints_missing path=%s", _HINTS_PATH)
        return {"apps": {}}
    apps = raw.get("apps") if isinstance(raw, dict) else {}
    return apps if isinstance(apps, dict) else {}


def normalize_app_key(app_id: str | None) -> str:
    return (app_id or "").strip().lower().replace("-", "_")


def hint_for_app(app_id: str | None) -> dict[str, Any] | None:
    apps = load_app_hints()
    key = normalize_app_key(app_id)
    if not key:
        return None
    if key in apps:
        return dict(apps[key])
    # slug variants: google-calendar → google_calendar
    compact = key.replace("_", "")
    for candidate, hint in apps.items():
        if candidate.replace("_", "") == compact:
            return dict(hint)
    return None


def hint_for_tool(tool_id: str, app_id: str | None = None) -> dict[str, Any] | None:
    from agent_service.integrations.app_keys import app_key_from_tool_id

    app = app_id or app_key_from_tool_id(tool_id or "")
    return hint_for_app(app)


def builder_guidance_block(*, tool_ids: list[str], app_ids: list[str] | None = None) -> str:
    """Short text injected into Builder prompts when selecting/configuring tools."""
    lines: list[str] = []
    seen: set[str] = set()
    apps = list(app_ids or [])
    if not apps:
        from agent_service.integrations.app_keys import app_key_from_tool_id

        apps = [app_key_from_tool_id(t) for t in tool_ids]
    for app in apps:
        key = normalize_app_key(app)
        if not key or key in seen:
            continue
        seen.add(key)
        hint = hint_for_app(key)
        if not hint:
            continue
        guidance = str(hint.get("builder_guidance") or "").strip()
        summary = str(hint.get("summary") or "").strip()
        auth = str(hint.get("auth_prop_guess") or "").strip()
        chunk = f"- {key}"
        if auth:
            chunk += f" (auth prop ≈ `{auth}`)"
        if summary:
            chunk += f": {summary}"
        if guidance:
            chunk += f" Guidance: {guidance}"
        lines.append(chunk)
    if not lines:
        return ""
    header = (
        "Pipedream / app configuration hints (from Stack32 knowledge — do not invent "
        "auth prop names; respect reloadProps + dynamic_props_id):\n"
    )
    return header + "\n".join(lines[:12])


def orchestrator_pipedream_system_addon() -> str:
    """Compact forever-on reminder for Builder system prompts."""
    return (
        "PIPEDREAM CONNECT RULES: (1) Auth prop camelCase from component definition, "
        "never the app slug alone. (2) After reloadProps, always pass dynamic_props_id. "
        "(3) Server injects authProvisionId — never from the model. (4) Prefer surgical "
        "tool_config / binding fixes over removing tools. (5) Consult app hints for "
        "Notion page/database, Slack/Discord channel, Canva designType+name, Sheets "
        "spreadsheet→worksheet, Airtable base→table, Stripe customer/account."
    )
