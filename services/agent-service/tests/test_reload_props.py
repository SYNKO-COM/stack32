"""Tests for reloadProps helpers and component cache."""

from __future__ import annotations

from agent_service.integrations.pipedream.schema import (
    NormalizedToolSchema,
    NormalizedProp,
    normalize_configurable_props,
)
from agent_service.integrations.pipedream.tool_config import (
    build_reload_props_seed,
    dynamic_props_id_from_config,
    schema_needs_reload_props,
)

CANVA_LIKE = {
    "key": "canva-create-design",
    "app": {"name_slug": "canva"},
    "configurable_props": [
        {"name": "canva", "type": "app", "app": "canva"},
        {
            "name": "designType",
            "type": "string",
            "label": "Design type",
            "reloadProps": True,
            "optional": True,
        },
        {"name": "name", "type": "string", "label": "Preset", "optional": True},
    ],
}


def test_dynamic_props_id_from_config() -> None:
    assert dynamic_props_id_from_config({"_dynamicPropsId": "dyp_123"}) == "dyp_123"
    assert dynamic_props_id_from_config({}) is None


def test_schema_needs_reload_props() -> None:
    schema = normalize_configurable_props(CANVA_LIKE, tool_id="pd:canva-create-design")
    assert schema_needs_reload_props(schema) is True


def test_build_reload_props_seed_includes_auth_and_triggers() -> None:
    schema = normalize_configurable_props(CANVA_LIKE, tool_id="pd:canva-create-design")
    configured = {
        "canva": {"authProvisionId": "apn_x"},
        "designType": "preset",
        "name": "doc",
    }
    seed = build_reload_props_seed(schema, configured)
    assert seed["canva"] == {"authProvisionId": "apn_x"}
    assert seed["designType"] == "preset"


def test_static_schema_marks_reload_props_extension() -> None:
    schema = normalize_configurable_props(CANVA_LIKE, tool_id="pd:canva-create-design")
    static = schema.static_config_schema()
    props = static.get("properties") or {}
    assert props.get("designType", {}).get("x-reload-props") is True
