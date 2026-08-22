"""Resolve Structure tool config for Live runtime and Pipedream execution.

UI saves static props to ``agent_tool_configurations`` (and optionally
``ToolBinding.config``). Live must merge those values, map prop aliases
(sheetId ↔ spreadsheetId), hide them from the LLM schema, inject them at
execution, and tell the model not to ask the user again.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from agent_service.integrations.pipedream.knowledge import hint_for_app, hint_for_tool
from agent_service.integrations.pipedream.schema import NormalizedToolSchema

logger = logging.getLogger(__name__)

_BANNED_PROMPT_KEYS = frozenset(
    {
        "auth_provision_id",
        "authProvisionId",
        "connection_id",
        "connectionId",
        "access_token",
        "refresh_token",
        "api_key",
        "oauth_token",
        "external_account_id",
    }
)


def _compact(name: str) -> str:
    return name.lower().replace("_", "").replace("-", "")


_GOOGLE_SHEETS_URL_RE = re.compile(
    r"docs\.google\.com/spreadsheets/d/([a-zA-Z0-9-_]+)",
    re.IGNORECASE,
)
_GOOGLE_SHEETS_GID_RE = re.compile(r"(?:[#&]gid=)(\d+)", re.IGNORECASE)


def extract_google_sheets_ids_from_text(value: str) -> dict[str, str]:
    """Parse spreadsheet id and optional worksheet gid from a URL or raw id string."""
    text = str(value or "").strip()
    if not text:
        return {}
    out: dict[str, str] = {}
    match = _GOOGLE_SHEETS_URL_RE.search(text)
    if match:
        out["sheetId"] = match.group(1)
    elif re.fullmatch(r"[a-zA-Z0-9-_]{20,}", text):
        out["sheetId"] = text
    gid = _GOOGLE_SHEETS_GID_RE.search(text)
    if gid:
        out["worksheetId"] = gid.group(1)
    return out


def _apply_google_sheets_defaults(
    out: dict[str, Any],
    *,
    app_id: str | None,
) -> dict[str, Any]:
    """When a spreadsheet is configured without a tab, default to the first sheet (gid 0)."""
    app = str(app_id or "").lower().replace("-", "_")
    if app not in {"google_sheets", "googlesheets", "sheets"}:
        return out
    has_sheet = any(
        out.get(k) not in (None, "")
        for k in ("sheetId", "spreadsheetId", "spreadsheet_id")
    )
    has_worksheet = any(
        out.get(k) not in (None, "")
        for k in ("worksheetId", "worksheetIds", "worksheet", "sheetName")
    )
    if has_sheet and not has_worksheet:
        out["worksheetId"] = "0"
    return out


def prop_alias_groups_for_app(app_id: str | None) -> list[frozenset[str]]:
    """Alias groups from app_hints ``required_static_hints`` (e.g. sheetId/spreadsheetId)."""
    hint = hint_for_app(app_id)
    if not hint:
        return []
    groups: list[frozenset[str]] = []
    for row in hint.get("required_static_hints") or []:
        if not isinstance(row, dict):
            continue
        keys = row.get("keys")
        if not isinstance(keys, list):
            continue
        names = [str(k) for k in keys if isinstance(k, str) and k.strip()]
        if len(names) >= 2:
            groups.append(frozenset(names))
    extra = hint.get("prop_aliases")
    if isinstance(extra, dict):
        for canonical, aliases in extra.items():
            if not isinstance(canonical, str):
                continue
            group = {canonical}
            if isinstance(aliases, list):
                group.update(str(a) for a in aliases if isinstance(a, str))
            if len(group) >= 2:
                groups.append(frozenset(group))
    return groups


def _alias_lookup(app_id: str | None) -> dict[str, str]:
    """Map every alias key → preferred canonical key (first key in each hint group)."""
    lookup: dict[str, str] = {}
    hint = hint_for_app(app_id)
    if not hint:
        return lookup
    for row in hint.get("required_static_hints") or []:
        if not isinstance(row, dict):
            continue
        keys = row.get("keys")
        if not isinstance(keys, list) or not keys:
            continue
        canonical = str(keys[0])
        for k in keys:
            if isinstance(k, str) and k.strip():
                lookup[str(k)] = canonical
    extra = hint.get("prop_aliases")
    if isinstance(extra, dict):
        for canonical, aliases in extra.items():
            if not isinstance(canonical, str):
                continue
            lookup[canonical] = canonical
            if isinstance(aliases, list):
                for alias in aliases:
                    if isinstance(alias, str) and alias.strip():
                        lookup[alias] = canonical
    return lookup


def normalize_static_config_for_schema(
    config: dict[str, Any] | None,
    schema: NormalizedToolSchema,
    *,
    app_id: str | None = None,
) -> dict[str, Any]:
    """Map alias keys to the prop names declared on the Pipedream component."""
    raw = dict(config or {})
    app = app_id or schema.app_id
    target_names = {p.name for p in schema.props}
    out: dict[str, Any] = {}

    for key, value in raw.items():
        if value is None or value == "":
            continue
        is_sheets_url = isinstance(value, str) and bool(_GOOGLE_SHEETS_URL_RE.search(value))
        if isinstance(value, str):
            parsed = extract_google_sheets_ids_from_text(value)
            if parsed:
                for pid, pval in parsed.items():
                    if pid in target_names and pid not in out:
                        out[pid] = pval
                    else:
                        for tname in target_names:
                            if _compact(tname) == _compact(pid):
                                out[tname] = pval
                                break
        if key in target_names and not (is_sheets_url and _compact(key) in {"sheetid", "spreadsheetid"}):
            out[key] = value

    alias_to_canonical = _alias_lookup(app)
    groups = prop_alias_groups_for_app(app)

    for prop in schema.props:
        if prop.name in out:
            continue
        # Direct alias → schema prop name via hint canonical names
        for alias, canonical in alias_to_canonical.items():
            if canonical == prop.name and alias in raw and raw[alias] not in (None, ""):
                out[prop.name] = raw[alias]
                break
        if prop.name in out:
            continue
        # Same compact name (sheetId vs spreadsheet_id)
        compact = _compact(prop.name)
        for key, value in raw.items():
            if value in (None, ""):
                continue
            if _compact(key) == compact:
                out[prop.name] = value
                break

    # Fill from alias groups when schema uses any member of the group
    for group in groups:
        present = {k: raw[k] for k in group if k in raw and raw[k] not in (None, "")}
        if not present:
            continue
        value = next(iter(present.values()))
        for name in group:
            if name in target_names and name not in out:
                out[name] = value

    return _apply_google_sheets_defaults(out, app_id=app)


def is_static_prop_configured(
    prop_name: str,
    config: dict[str, Any] | None,
    *,
    app_id: str | None = None,
) -> bool:
    """True when config (or an alias) has a non-empty value for this static prop."""
    cfg = dict(config or {})
    if prop_name in cfg and cfg[prop_name] not in (None, ""):
        return True
    compact = _compact(prop_name)
    for key, value in cfg.items():
        if value in (None, ""):
            continue
        if _compact(key) == compact:
            return True
    for group in prop_alias_groups_for_app(app_id):
        if prop_name not in group:
            continue
        if any(cfg.get(k) not in (None, "") for k in group):
            return True
    return False


def merge_binding_and_stored_config(
    *,
    binding_config: dict[str, Any] | None,
    stored_config: dict[str, Any] | None,
) -> dict[str, Any]:
    """ToolBinding.config (portable) + installation row (account-specific)."""
    merged: dict[str, Any] = {}
    if isinstance(binding_config, dict):
        merged.update(binding_config)
    if isinstance(stored_config, dict):
        merged.update(stored_config)
    return merged


async def resolve_effective_tool_config(
    *,
    user_id: str,
    agent_id: str,
    tool_id: str,
    binding_config: dict[str, Any] | None = None,
    installation_id: str | None = None,
    app_id: str | None = None,
) -> dict[str, Any]:
    """Load DB config, merge binding overrides, normalize aliases for the action schema."""
    from agent_service.integrations.pipedream.accounts import load_agent_tool_config
    from agent_service.integrations.registry import get_provider_registry

    stored = await load_agent_tool_config(
        user_id=user_id,
        agent_id=agent_id,
        tool_id=tool_id,
        installation_id=installation_id,
    )
    merged = merge_binding_and_stored_config(
        binding_config=binding_config,
        stored_config=stored,
    )
    if not merged:
        return {}

    provider = get_provider_registry().get_provider("pipedream")
    if provider is None or not tool_id.startswith("pd:"):
        return merged

    try:
        schema = await provider.get_normalized_schema(tool_id)
    except Exception:  # noqa: BLE001
        logger.debug("tool_config_schema_failed tool_id=%s", tool_id, exc_info=True)
        return merged

    app = app_id or schema.app_id or hint_for_tool(tool_id, app_id)
    if isinstance(app, dict):
        app = None
    return normalize_static_config_for_schema(merged, schema, app_id=app)


async def resolve_agent_tool_configs(
    spec: Any,
    *,
    user_id: str,
    agent_id: str,
    installation_id: str | None = None,
) -> dict[str, dict[str, Any]]:
    """All effective static configs for enabled Pipedream tools on an agent."""
    configs: dict[str, dict[str, Any]] = {}
    tools = getattr(spec, "tools", None) or []
    for binding in tools:
        if not getattr(binding, "enabled", True):
            continue
        tid = str(getattr(binding, "tool_id", "") or "")
        if not tid.startswith("pd:"):
            continue
        binding_cfg = binding.config if isinstance(getattr(binding, "config", None), dict) else {}
        configs[tid] = await resolve_effective_tool_config(
            user_id=user_id,
            agent_id=agent_id,
            tool_id=tid,
            binding_config=binding_cfg,
            installation_id=installation_id,
            app_id=getattr(binding, "app_id", None),
        )
    return configs


def _safe_config_for_prompt(config: dict[str, Any]) -> dict[str, Any]:
    safe: dict[str, Any] = {}
    for key, value in config.items():
        if key in _BANNED_PROMPT_KEYS:
            continue
        if value in (None, ""):
            continue
        safe[key] = value
    return safe


def configured_tools_system_block(
    spec: Any,
    tool_configs: dict[str, dict[str, Any]],
) -> str:
    """Runtime system prompt section listing pre-configured tool static props."""
    lines: list[str] = []
    tools = getattr(spec, "tools", None) or []
    for binding in tools:
        if not getattr(binding, "enabled", True):
            continue
        tid = str(getattr(binding, "tool_id", "") or "")
        cfg = tool_configs.get(tid) or {}
        safe = _safe_config_for_prompt(cfg)
        if not safe:
            continue
        app = getattr(binding, "app_id", None) or ""
        label = f"{tid}" + (f" ({app})" if app else "")
        lines.append(f"- {label}: {json.dumps(safe, ensure_ascii=False)}")

    if not lines:
        return ""
    guidance: list[str] = []
    seen_apps: set[str] = set()
    for binding in tools:
        if not getattr(binding, "enabled", True):
            continue
        app = str(getattr(binding, "app_id", None) or "").strip()
        if not app or app in seen_apps:
            continue
        seen_apps.add(app)
        hint = hint_for_app(app)
        if hint and isinstance(hint.get("builder_guidance"), str):
            guidance.append(f"- {app}: {hint['builder_guidance'].strip()}")

    block = (
        "CONFIGURED TOOLS (set in Structure — do NOT ask the user for these IDs; "
        "they are injected automatically when you call the tool):\n"
        + "\n".join(lines)
        + "\n\nWhen the user mentions a spreadsheet URL, prefer the configured sheetId/"
        "worksheetId above — only use URL parsing if no Structure config exists. "
        "Call the tool directly with row/column data; do not stop to re-confirm IDs."
    )
    if guidance:
        block += "\n\nAPP GUIDANCE:\n" + "\n".join(guidance)
    return block
