"""Tests for Pipedream tool config resolution and runtime injection."""

from __future__ import annotations

import pytest

from agent_service.integrations.pipedream.schema import (
    build_configured_props,
    normalize_configurable_props,
)
from agent_service.integrations.pipedream.tool_config import (
    configured_tools_system_block,
    is_static_prop_configured,
    merge_binding_and_stored_config,
    normalize_static_config_for_schema,
)
from agent_service.models.agent_spec import AgentSpec, ToolBinding

GOOGLE_SHEETS_COMPONENT = {
    "key": "google_sheets-add-single-row",
    "app": {"name_slug": "google_sheets"},
    "configurable_props": [
        {"name": "googleSheets", "type": "app", "app": "google_sheets"},
        {
            "name": "sheetId",
            "type": "string",
            "label": "Spreadsheet",
            "remoteOptions": True,
            "optional": True,
        },
        {
            "name": "worksheetId",
            "type": "string",
            "label": "Worksheet",
            "remoteOptions": True,
            "optional": True,
        },
        {
            "name": "columns",
            "type": "string[]",
            "label": "Columns",
            "optional": False,
        },
    ],
}


def test_normalize_spreadsheet_id_alias_to_sheet_id() -> None:
    schema = normalize_configurable_props(
        GOOGLE_SHEETS_COMPONENT,
        tool_id="pd:google_sheets-add-single-row",
    )
    normalized = normalize_static_config_for_schema(
        {"spreadsheetId": "abc123", "worksheetId": "0"},
        schema,
        app_id="google_sheets",
    )
    assert normalized["sheetId"] == "abc123"
    assert normalized["worksheetId"] == "0"


def test_normalize_google_sheets_url_extracts_ids() -> None:
    schema = normalize_configurable_props(
        GOOGLE_SHEETS_COMPONENT,
        tool_id="pd:google_sheets-add-single-row",
    )
    url = (
        "https://docs.google.com/spreadsheets/d/1NE3nvOln6atl5qNtZCAUpoeelXIYhpMIWXbP5xVOPk0/"
        "edit?usp=sharing#gid=123456"
    )
    normalized = normalize_static_config_for_schema(
        {"sheetId": url},
        schema,
        app_id="google_sheets",
    )
    assert normalized["sheetId"] == "1NE3nvOln6atl5qNtZCAUpoeelXIYhpMIWXbP5xVOPk0"
    assert normalized["worksheetId"] == "123456"


def test_normalize_google_sheets_defaults_worksheet_zero() -> None:
    schema = normalize_configurable_props(
        GOOGLE_SHEETS_COMPONENT,
        tool_id="pd:google_sheets-add-single-row",
    )
    normalized = normalize_static_config_for_schema(
        {"sheetId": "abc123"},
        schema,
        app_id="google_sheets",
    )
    assert normalized["sheetId"] == "abc123"
    assert normalized["worksheetId"] == "0"


def test_extract_google_sheets_ids_from_text() -> None:
    from agent_service.integrations.pipedream.tool_config import extract_google_sheets_ids_from_text

    parsed = extract_google_sheets_ids_from_text(
        "https://docs.google.com/spreadsheets/d/abc123/edit#gid=0"
    )
    assert parsed["sheetId"] == "abc123"
    assert parsed["worksheetId"] == "0"


def test_build_configured_props_uses_alias_config() -> None:
    schema = normalize_configurable_props(
        GOOGLE_SHEETS_COMPONENT,
        tool_id="pd:google_sheets-add-single-row",
    )
    configured = build_configured_props(
        schema,
        auth_provision_id="apn_test",
        static_config={"spreadsheetId": "abc123", "worksheetId": "0"},
        runtime_args={"columns": ["Name", "Email"]},
    )
    assert configured["googleSheets"] == {"authProvisionId": "apn_test"}
    assert configured["sheetId"] == "abc123"
    assert configured["worksheetId"] == "0"
    assert configured["columns"] == ["Name", "Email"]


def test_is_static_prop_configured_with_alias() -> None:
    cfg = {"spreadsheetId": "abc123"}
    assert is_static_prop_configured("sheetId", cfg, app_id="google_sheets")
    assert not is_static_prop_configured("worksheetId", cfg, app_id="google_sheets")


def test_merge_binding_and_stored_config() -> None:
    merged = merge_binding_and_stored_config(
        binding_config={"hasHeaders": True},
        stored_config={"spreadsheetId": "abc123"},
    )
    assert merged["hasHeaders"] is True
    assert merged["spreadsheetId"] == "abc123"


def test_configured_tools_system_block() -> None:
    from agent_service.models.agent_spec import AgentIdentity, AgentInstructions
    from agent_service.models.graph_spec import default_linear_graph

    spec = AgentSpec(
        identity=AgentIdentity(name="Sheets", role="CRM"),
        goal="Track leads",
        instructions=AgentInstructions(system="Use Sheets."),
        tools=[
            ToolBinding(
                tool_id="pd:google_sheets-add-single-row",
                provider="pipedream",
                app_id="google_sheets",
                enabled=True,
            )
        ],
        graph=default_linear_graph(["pd:google_sheets-add-single-row"]),
    )
    block = configured_tools_system_block(
        spec,
        {
            "pd:google_sheets-add-single-row": {
                "sheetId": "abc123",
                "worksheetId": "0",
            }
        },
    )
    assert "CONFIGURED TOOLS" in block
    assert "abc123" in block
    assert "do not ask" in block.lower()


def test_select_tool_config_row_app_sibling_fallback() -> None:
    from agent_service.integrations.pipedream.accounts import _select_tool_config_row

    rows = [
        {
            "tool_id": "pd:google_sheets-add-single-row",
            "config": {"sheetId": "abc123", "worksheetId": "0"},
            "updated_at": "2026-01-01T00:00:00Z",
        }
    ]
    picked = _select_tool_config_row(
        rows,
        tool_id="pd:google_sheets-add-multiple-rows",
        installation_id=None,
    )
    assert picked is not None
    assert picked["config"]["sheetId"] == "abc123"


def test_select_tool_config_row_prefers_exact_tool_id() -> None:
    from agent_service.integrations.pipedream.accounts import _select_tool_config_row

    rows = [
        {
            "tool_id": "pd:google_sheets-add-single-row",
            "config": {"sheetId": "old"},
            "updated_at": "2026-01-01T00:00:00Z",
        },
        {
            "tool_id": "pd:google_sheets-add-multiple-rows",
            "config": {"sheetId": "exact"},
            "updated_at": "2026-01-02T00:00:00Z",
        },
    ]
    picked = _select_tool_config_row(
        rows,
        tool_id="pd:google_sheets-add-multiple-rows",
        installation_id=None,
    )
    assert picked is not None
    assert picked["config"]["sheetId"] == "exact"


@pytest.mark.asyncio
async def test_async_schemas_hide_configured_static_props(monkeypatch) -> None:
    from agent_service.runtime.tool_schema import async_schemas_for_tools

    class FakeProvider:
        async def get_tool_schema(self, tool_id: str) -> dict:
            schema = normalize_configurable_props(
                GOOGLE_SHEETS_COMPONENT,
                tool_id=tool_id,
            )
            return {
                "provider_app_id": "google_sheets",
                "input_schema": schema.llm_json_schema(include_static_unconfigured=True),
                "static_schema": schema.static_config_schema(),
            }

        async def get_tool(self, tool_id: str):
            return None

    class FakeRegistry:
        def get_provider(self, name: str):
            return FakeProvider() if name == "pipedream" else None

    monkeypatch.setattr(
        "agent_service.integrations.registry.get_provider_registry",
        lambda: FakeRegistry(),
    )

    schemas = await async_schemas_for_tools(
        ["pd:google_sheets-add-single-row"],
        tool_configs={
            "pd:google_sheets-add-single-row": {
                "spreadsheetId": "abc123",
                "worksheetId": "0",
            }
        },
    )
    params = schemas[0]["function"]["parameters"]
    props = params.get("properties") or {}
    assert "sheetId" not in props
    assert "worksheetId" not in props
    assert "columns" in props
