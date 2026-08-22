"""Pipedream knowledge + app hints for Stack32 Builder / runtime.

Loads curated docs under ``docs/pipedream`` so the orchestrator can reason about
Connect auth props, dynamic props, and app-specific configuration (Notion page,
Slack channel, Canva designType, etc.) without hardcoding every agent.

For the 3000+ app long tail, ``auto_hints`` + ``generated_app_hints.json`` fill
gaps when no curated entry exists.
"""

from __future__ import annotations

import json
import logging
import os
from functools import lru_cache
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

def _resolve_docs_dir() -> Path:
    """Locate the Pipedream runtime data (hints + Connect knowledge).

    These files are read on every tool-config resolution, so they are package
    data that ships beside the code. They used to live in the repo's ``docs/``
    and be found via ``parents[5]`` — an index out of range inside the container
    (``/app/agent_service/...``), and a directory the Docker build context
    (``services/``) could not reach anyway.

    Resolution is deliberately NOT a search. Walking up looking for a matching
    directory would let any ancestor that happens to be writable — a workspace
    root, a cwd under tenant control — supply the service's own configuration.
    Only the packaged location, or an explicit operator override, is trusted.
    """
    override = os.environ.get("PIPEDREAM_DOCS_DIR")
    if override:
        return Path(override)
    return Path(__file__).resolve().parent / "data"


_DOCS_DIR = _resolve_docs_dir()

# Files the integrations layer cannot work correctly without. Missing data does
# not crash a request — it degrades tool-config resolution silently, which is
# how an IndexError here went unnoticed in production for days. Surface it on
# /ready instead so a bad image is visible before users hit it.
REQUIRED_DATA_FILES = ("app_hints.json", "generated_app_hints.json", "CONNECT_KNOWLEDGE.md")


def missing_runtime_data() -> list[str]:
    """Return the names of required data files that are absent or unreadable."""
    missing: list[str] = []
    for name in REQUIRED_DATA_FILES:
        path = _DOCS_DIR / name
        try:
            if not path.is_file() or path.stat().st_size == 0:
                missing.append(name)
        except OSError:
            missing.append(name)
    return missing
_HINTS_PATH = _DOCS_DIR / "app_hints.json"
_GENERATED_HINTS_PATH = _DOCS_DIR / "generated_app_hints.json"
_KNOWLEDGE_PATH = _DOCS_DIR / "CONNECT_KNOWLEDGE.md"

# Populated at runtime when Pipedream schemas are loaded (JIT, in-process).
_runtime_app_hints: dict[str, dict[str, Any]] = {}


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


@lru_cache(maxsize=1)
def load_generated_app_hints() -> dict[str, Any]:
    """Batch-enriched hints (``scripts/enrich_pipedream_catalog.py``)."""
    try:
        raw = json.loads(_GENERATED_HINTS_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    apps = raw.get("apps") if isinstance(raw, dict) else {}
    return apps if isinstance(apps, dict) else {}


def register_runtime_app_hint(app_id: str | None, hint: dict[str, Any] | None) -> None:
    """Cache schema-derived hints after a Pipedream component is loaded."""
    if not app_id or not hint:
        return
    key = normalize_app_key(app_id)
    if not key:
        return
    from agent_service.integrations.pipedream.auto_hints import merge_curated_and_auto

    curated = load_app_hints().get(key)
    generated = load_generated_app_hints().get(key)
    base = generated if isinstance(generated, dict) else None
    merged = merge_curated_and_auto(base, hint)
    if curated:
        merged = merge_curated_and_auto(curated, merged)
    if merged:
        _runtime_app_hints[key] = merged


def _lookup_hint_dict(apps: dict[str, Any], key: str) -> dict[str, Any] | None:
    if key in apps:
        return dict(apps[key])
    compact = key.replace("_", "")
    for candidate, hint in apps.items():
        if candidate.replace("_", "") == compact:
            return dict(hint)
    return None


def hint_for_app(app_id: str | None) -> dict[str, Any] | None:
    key = normalize_app_key(app_id)
    if not key:
        return None

    curated = _lookup_hint_dict(load_app_hints(), key)
    generated = _lookup_hint_dict(load_generated_app_hints(), key)
    runtime = _runtime_app_hints.get(key)

    from agent_service.integrations.pipedream.auto_hints import merge_curated_and_auto

    merged: dict[str, Any] | None = None
    for layer in (generated, runtime):
        if not layer:
            continue
        merged = merge_curated_and_auto(merged, layer) if merged else dict(layer)
    if curated:
        merged = merge_curated_and_auto(curated, merged)
    elif merged:
        pass
    else:
        return None
    return merged


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
