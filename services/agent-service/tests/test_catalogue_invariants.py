"""The config drawer must stay honest across the whole Pipedream catalogue.

These are real components, captured from 60 different apps, kept here so the
invariants hold in CI without network. Sampling 500 live apps (777 components)
with the same checks found zero violations; this fixture is the tripwire that
keeps it that way.

The invariants, all derived from what the catalogue itself declares:
  - a prop it marks `optional: true` is never demanded of the user;
  - free text is left to the agent, never asked for as configuration;
  - a resource in the user's account is offered as a picker, not a bare id.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from agent_service.integrations.pipedream.schema import (
    _STATIC_NAME_HINTS,
    normalize_configurable_props,
)

FIXTURE = Path(__file__).parent / "fixtures" / "pipedream_components.json"
COMPONENTS = json.loads(FIXTURE.read_text())


def ids(components):
    return [c["key"] for c in components]


def test_the_fixture_covers_a_wide_slice_of_the_catalogue():
    assert len(COMPONENTS) >= 50
    assert len({c["app"]["name_slug"] for c in COMPONENTS}) >= 50


@pytest.mark.parametrize("component", COMPONENTS, ids=ids(COMPONENTS))
def test_an_optional_prop_is_never_demanded(component):
    schema = normalize_configurable_props(component, action_id=component["key"])
    required = set(schema.static_config_schema().get("required") or [])
    declared = {p["name"]: p for p in component["configurable_props"] if "name" in p}
    for name in required:
        assert declared.get(name, {}).get("optional") is not True, (
            f"{component['key']}: {name} is optional in the catalogue but demanded here"
        )


@pytest.mark.parametrize("component", COMPONENTS, ids=ids(COMPONENTS))
def test_free_text_is_left_to_the_agent(component):
    schema = normalize_configurable_props(component, action_id=component["key"])
    offered = set((schema.static_config_schema().get("properties") or {}).keys())
    declared = {p["name"]: p for p in component["configurable_props"] if "name" in p}
    for name in offered:
        d = declared.get(name, {})
        kind = str(d.get("type") or "")
        picker = bool(d.get("remoteOptions") or d.get("useQuery")) or kind.startswith("$.")
        if picker:
            continue
        compact = name.lower().replace("_", "").replace("-", "")
        assert compact in _STATIC_NAME_HINTS, (
            f"{component['key']}: {name} is plain text and should be the agent's to write"
        )


@pytest.mark.parametrize("component", COMPONENTS, ids=ids(COMPONENTS))
def test_an_account_resource_is_offered_as_a_picker(component):
    schema = normalize_configurable_props(component, action_id=component["key"])
    by_name = {p.name: p for p in schema.props}
    for raw in component["configurable_props"]:
        kind = str(raw.get("type") or "")
        if not kind.startswith("$.") or "interface" in kind or "service" in kind:
            continue
        prop = by_name.get(raw.get("name"))
        assert prop is not None
        assert prop.kind == "static", f"{component['key']}: {prop.name} should be configuration"
        assert prop.remote_options, f"{component['key']}: {prop.name} should offer its values"
