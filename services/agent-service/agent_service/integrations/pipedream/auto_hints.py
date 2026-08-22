"""Auto-generate app hints from Pipedream component schemas.

Curated ``app_hints.json`` (~55 apps) overrides these for edge cases.
Every other app gets schema-driven Structure labels, required props, and auth
prop names extracted from ``configurable_props`` at runtime or via batch enrich.
"""

from __future__ import annotations

import re
from typing import Any

from agent_service.integrations.pipedream.schema import NormalizedToolSchema

# Props configured in Structure "advanced" — not blocking readiness/save.
_ADVANCED_ONLY_STATIC = frozenset(
    {
        "hasheaders",
        "headerrownumber",
        "watchdrive",
        "drive",
        "driveid",
        "timer",
        "asuser",
        "as_user",
        "ignorelinebreaks",
        "includelinebreaks",
    }
)


def _compact(name: str) -> str:
    return name.lower().replace("_", "").replace("-", "")


def _plain_hint(text: str | None, *, max_len: int = 160) -> str:
    if not text:
        return ""
    cleaned = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)
    cleaned = re.sub(r"`([^`]+)`", r"\1", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    if len(cleaned) > max_len:
        return f"{cleaned[: max_len - 1]}…"
    return cleaned


def _humanize(name: str) -> str:
    spaced = re.sub(r"([a-z])([A-Z])", r"\1 \2", name)
    spaced = re.sub(r"[_-]+", " ", spaced).strip()
    return spaced[:1].upper() + spaced[1:] if spaced else name


def hint_from_normalized_schema(schema: NormalizedToolSchema) -> dict[str, Any]:
    """Build an app_hints-shaped dict from a normalized Pipedream action/trigger schema."""
    static_props = schema.props_of("static")
    required_static_hints: list[dict[str, Any]] = []
    required_props: list[str] = []
    seen_keys: set[str] = set()

    for prop in static_props:
        compact = _compact(prop.name)
        if compact in _ADVANCED_ONLY_STATIC:
            continue
        if not prop.remote_options and compact not in {
            "sheetid",
            "spreadsheetid",
            "worksheetid",
            "channelid",
            "pageid",
            "databaseid",
            "baseid",
            "tableid",
        }:
            continue
        if prop.name in seen_keys:
            continue
        seen_keys.add(prop.name)
        label = (prop.label or "").strip() or _humanize(prop.name)
        why = _plain_hint(prop.description) or f"Ressource requise : {label}."
        required_static_hints.append(
            {
                "keys": [prop.name],
                "label": label,
                "why": why,
            }
        )
        if prop.required:
            required_props.append(prop.name)

    has_reload = any(
        isinstance(p.raw, dict) and p.raw.get("reloadProps") for p in schema.props
    )
    guidance_parts: list[str] = []
    if has_reload:
        guidance_parts.append(
            "Configure resource pickers in order (each dropdown may unlock the next). "
            "The server passes dynamic_props_id after reloadProps — do not ask the user for it."
        )
    if required_static_hints:
        guidance_parts.append(
            "Fill every resource picker in Structure before Live; IDs are injected at execution."
        )
    if schema.auth_prop_name:
        guidance_parts.append(
            f"Auth prop is `{schema.auth_prop_name}` (server-injected, never from the model)."
        )

    app_label = schema.app_id or schema.action_id or "pipedream"
    return {
        "auth_prop_guess": schema.auth_prop_name or "",
        "summary": f"Configuration auto depuis le schéma Pipedream ({app_label}).",
        "required_static_hints": required_static_hints,
        "required_props": required_props,
        "builder_guidance": " ".join(guidance_parts)
        or "Configure all Structure fields marked as resource pickers before running Live.",
        "_auto_generated": True,
        "_source_action": schema.action_id,
    }


def hint_from_component(
    component: dict[str, Any] | None,
    *,
    tool_id: str = "",
    action_id: str = "",
) -> dict[str, Any] | None:
    """Generate hints directly from a raw Pipedream component payload."""
    if not component:
        return None
    from agent_service.integrations.pipedream.schema import normalize_configurable_props

    schema = normalize_configurable_props(
        component,
        tool_id=tool_id,
        action_id=action_id or str(component.get("key") or ""),
    )
    if not schema.app_id and not schema.props:
        return None
    return hint_from_normalized_schema(schema)


def merge_curated_and_auto(
    curated: dict[str, Any] | None,
    auto: dict[str, Any] | None,
) -> dict[str, Any] | None:
    """Curated hints win; auto fills gaps (extra static props, missing auth guess)."""
    if not curated and not auto:
        return None
    if not curated:
        return dict(auto or {})
    if not auto:
        return dict(curated)

    merged = dict(auto)
    merged.update(curated)

    curated_hints = curated.get("required_static_hints") or []
    auto_hints = auto.get("required_static_hints") or []
    if not isinstance(curated_hints, list):
        curated_hints = []
    if not isinstance(auto_hints, list):
        auto_hints = []

    curated_keys: set[str] = set()
    for row in curated_hints:
        if isinstance(row, dict):
            for k in row.get("keys") or []:
                if isinstance(k, str):
                    curated_keys.add(k)

    combined = list(curated_hints)
    for row in auto_hints:
        if not isinstance(row, dict):
            continue
        keys = [k for k in (row.get("keys") or []) if isinstance(k, str)]
        if keys and all(k in curated_keys for k in keys):
            continue
        combined.append(row)
        curated_keys.update(keys)

    merged["required_static_hints"] = combined

    curated_req = list(curated.get("required_props") or [])
    auto_req = list(auto.get("required_props") or [])
    merged["required_props"] = list(dict.fromkeys([*curated_req, *auto_req]))
    if curated.get("auth_prop_guess"):
        merged["auth_prop_guess"] = curated["auth_prop_guess"]
    merged.pop("_auto_generated", None)
    if not curated.get("builder_guidance") and auto.get("builder_guidance"):
        merged["builder_guidance"] = auto["builder_guidance"]
    return merged
