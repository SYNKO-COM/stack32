"""Google Sheets static config must land on the component's real prop names.

Observed in the Structure trigger drawer: "Worksheet ID(s)" was a required
field that stayed unfilled, so the trigger could not be saved and the agent
stayed on "à configurer". Two independent casing bugs caused it:

- the "spreadsheet set but no tab chosen" check compared against the literals
  sheetId / spreadsheetId, while the component declares sheetID — so it always
  concluded no spreadsheet was configured and skipped the default;
- the default was written to "worksheetId" while the component declares
  "worksheetIDs", so even when it did fire it landed on a key nothing reads.
"""

from __future__ import annotations

import pytest

from agent_service.integrations.pipedream.schema import NormalizedProp, NormalizedToolSchema
from agent_service.integrations.pipedream.tool_config import normalize_static_config_for_schema

SPREADSHEET_ID = "1NE3hvOln6atI5qNtZCAUpceeiXlYhpMIWXbP5xVOPk0"


def _schema(*prop_names: str) -> NormalizedToolSchema:
    return NormalizedToolSchema(
        tool_id="pd:google_sheets-new-row-added",
        action_id="new-row-added",
        app_id="google_sheets",
        version="1",
        auth_prop_name="googleSheets",
        props=[
            NormalizedProp(
                name=name,
                kind="string",
                json_type="string",
                required=True,
                description="",
                label=name,
                default=None,
                enum=None,
                remote_options=True,
                app_slug="google_sheets",
                raw={},
            )
            for name in prop_names
        ],
    )


@pytest.mark.parametrize(
    ("sheet_prop", "worksheet_prop"),
    [
        ("sheetID", "worksheetIDs"),  # the real casing on the live component
        ("sheetId", "worksheetId"),
        ("spreadsheetId", "worksheetIds"),
    ],
)
def test_worksheet_defaults_to_the_first_tab_on_the_real_prop(sheet_prop, worksheet_prop):
    schema = _schema("watchedDrive", sheet_prop, worksheet_prop)
    out = normalize_static_config_for_schema(
        {"sheetId": SPREADSHEET_ID}, schema, app_id="google_sheets"
    )
    assert out[sheet_prop] == SPREADSHEET_ID
    assert out[worksheet_prop] == "0", out


def test_an_explicit_tab_is_never_overwritten():
    schema = _schema("sheetID", "worksheetIDs")
    out = normalize_static_config_for_schema(
        {"sheetId": SPREADSHEET_ID, "worksheetIDs": "12345"}, schema, app_id="google_sheets"
    )
    assert out["worksheetIDs"] == "12345"


def test_a_spreadsheet_url_is_reduced_to_its_id():
    schema = _schema("sheetID", "worksheetIDs")
    url = f"https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/edit#gid=0"
    out = normalize_static_config_for_schema({"sheetId": url}, schema, app_id="google_sheets")
    assert out["sheetID"] == SPREADSHEET_ID
    assert "docs.google.com" not in str(out)


def test_the_worksheet_never_receives_the_spreadsheet_id():
    """The corruption seen in the UI: both fields holding the same value."""
    schema = _schema("watchedDrive", "sheetID", "worksheetIDs")
    out = normalize_static_config_for_schema(
        {"sheetId": SPREADSHEET_ID}, schema, app_id="google_sheets"
    )
    assert out["worksheetIDs"] != SPREADSHEET_ID


def test_other_apps_are_untouched():
    schema = _schema("channel")
    out = normalize_static_config_for_schema({"channel": "#general"}, schema, app_id="slack")
    assert out == {"channel": "#general"}
