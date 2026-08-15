from agent_service.integrations.app_keys import (
    app_key_from_tool_id,
    expand_bind_tool_ids,
)


def test_gmail_and_calendar_are_distinct_apps_even_with_suite_app_id():
    assert app_key_from_tool_id("gmail_list", app_id="google") == "gmail"
    assert app_key_from_tool_id("calendar_list", app_id="google") == "google_calendar"
    assert app_key_from_tool_id("google_docs_create", app_id="google") == "google_docs"
    assert app_key_from_tool_id("pd:google_sheets-add-single-row", app_id="google") == "google_sheets"


def test_expand_gmail_alias_does_not_include_calendar():
    ids = expand_bind_tool_ids(["gmail"])
    assert "gmail_send_message" in ids
    assert "calendar_list" not in ids
