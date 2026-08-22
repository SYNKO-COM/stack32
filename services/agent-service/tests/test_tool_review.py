"""Tests for mandatory tool review helpers."""

import pytest

from agent_service.builder.tool_review import (
    apply_reviewed_tools,
    build_tool_review_entries,
    prompt_implies_tool_change,
    should_interrupt_tool_review,
    tools_changed,
)
from agent_service.models.agent_spec import ToolBinding


def test_tools_changed_first_build_with_app():
    proposed = [
        ToolBinding(tool_id="current_datetime", provider="native"),
        ToolBinding(tool_id="gmail_send", provider="pipedream", app_id="gmail"),
    ]
    assert tools_changed(proposed=proposed, current=None) is True


def test_tools_changed_natives_only_skips_review():
    proposed = [
        ToolBinding(tool_id="current_datetime", provider="native"),
        ToolBinding(tool_id="web_search", provider="native"),
        ToolBinding(tool_id="calculator", provider="native"),
    ]
    assert tools_changed(proposed=proposed, current=None) is False


def test_tools_changed_same_app_ignores_extra_actions():
    current = [
        ToolBinding(tool_id="gmail_list", provider="pipedream", app_id="gmail"),
        ToolBinding(tool_id="web_search", provider="native"),
    ]
    proposed = [
        ToolBinding(tool_id="gmail_list", provider="pipedream", app_id="gmail"),
        ToolBinding(tool_id="gmail_send", provider="pipedream", app_id="gmail"),
        ToolBinding(tool_id="calculator", provider="native"),
    ]
    assert tools_changed(proposed=proposed, current=current) is False


def test_build_entries_groups_gmail_actions_and_hides_natives():
    proposed = [
        ToolBinding(tool_id="web_search", provider="native"),
        ToolBinding(tool_id="calculator", provider="native"),
        ToolBinding(tool_id="gmail_list", provider="pipedream", app_id="gmail"),
        ToolBinding(tool_id="gmail_send", provider="pipedream", app_id="gmail"),
        ToolBinding(tool_id="calendar_list", provider="pipedream", app_id="google_calendar"),
    ]
    entries = build_tool_review_entries(proposed=proposed, current=None, goal="Préparer un meeting")
    ids = {e["app_id"] for e in entries}
    assert ids == {"gmail", "google_calendar"}
    gmail = next(e for e in entries if e["app_id"] == "gmail")
    assert gmail["name"] == "Gmail"
    assert set(gmail["tool_ids"]) == {"gmail_list", "gmail_send"}
    assert gmail["change"] == "add"


def test_build_entries_french_utility():
    proposed = [ToolBinding(tool_id="gmail_send", provider="pipedream", app_id="gmail")]
    entries = build_tool_review_entries(
        proposed=proposed, current=None, goal="Préparer un meeting", locale="fr"
    )
    utility = entries[0]["utility"]
    assert "mail" in utility.lower()
    assert "sert à avancer" not in utility
    assert "Lets the agent" not in utility
    assert "Help the user achieve their goal" not in utility
    sheets = build_tool_review_entries(
        proposed=[
            ToolBinding(tool_id="sheets_update", provider="pipedream", app_id="google_sheets")
        ],
        current=None,
        goal="Préparer un meeting",
        locale="fr",
    )[0]["utility"]
    assert sheets != utility
    assert "feuille" in sheets.lower() or "calcul" in sheets.lower()


def test_build_entries_uses_config_utility():
    proposed = [
        ToolBinding(
            tool_id="gmail_send",
            provider="pipedream",
            app_id="gmail",
            config={"utility": "Envoyer le brief hebdo aux clients."},
        )
    ]
    entries = build_tool_review_entries(proposed=proposed, current=None, goal="x", locale="fr")
    assert entries[0]["utility"] == "Envoyer le brief hebdo aux clients."


def test_is_generic_utility():
    from agent_service.builder.tool_review import is_generic_utility

    assert is_generic_utility(
        "Gmail sert à avancer sur cet objectif : Help the user achieve their goal.."
    )
    assert not is_generic_utility("Lire les mails des leads et préparer une réponse.")


@pytest.mark.asyncio
async def test_enrich_utilities_with_llm_overrides_adds():
    from agent_service.builder.tool_review import enrich_utilities_with_llm

    class _FakeResult:
        content = (
            '{"gmail":"Lire les mails des leads et préparer une réponse.",'
            '"google_calendar":"Bloquer des créneaux pour les demos."}'
        )

    class _FakeGateway:
        async def complete(self, **_kwargs):
            return _FakeResult()

    entries = build_tool_review_entries(
        proposed=[
            ToolBinding(tool_id="gmail_send", provider="pipedream", app_id="gmail"),
            ToolBinding(tool_id="cal_create", provider="pipedream", app_id="google_calendar"),
        ],
        current=None,
        goal="Qualifier des leads",
        locale="fr",
    )
    out = await enrich_utilities_with_llm(
        entries, goal="Qualifier des leads", locale="fr", gateway=_FakeGateway()
    )
    by_app = {e["app_id"]: e["utility"] for e in out}
    assert "leads" in by_app["gmail"].lower()
    assert "créneaux" in by_app["google_calendar"].lower() or "demos" in by_app["google_calendar"].lower()


def test_apply_reviewed_tools_keeps_hidden_and_all_app_actions():
    pending = [
        ToolBinding(tool_id="current_datetime", provider="native"),
        ToolBinding(tool_id="web_search", provider="native"),
        ToolBinding(tool_id="gmail_list", provider="pipedream", app_id="gmail"),
        ToolBinding(tool_id="gmail_send", provider="pipedream", app_id="gmail"),
        ToolBinding(tool_id="calendar_list", provider="pipedream", app_id="google_calendar"),
    ]
    out = apply_reviewed_tools(
        pending_tools=pending,
        reviewed=[
            {
                "tool_id": "gmail_list",
                "provider": "pipedream",
                "app_id": "gmail",
                "tool_ids": ["gmail_list", "gmail_send"],
                "utility": "Envoyer le brief",
            }
        ],
    )
    ids = [t.tool_id for t in out]
    assert "current_datetime" in ids
    assert "structured_output" in ids
    assert "web_search" in ids
    assert "gmail_list" in ids
    assert "gmail_send" in ids
    assert "calendar_list" not in ids
    gmail = next(t for t in out if t.tool_id == "gmail_send")
    assert gmail.config.get("utility") == "Envoyer le brief"


def test_prompt_implies_tool_change_french():
    assert prompt_implies_tool_change("Tu ne m'as pas mis d'outils") is True
    assert prompt_implies_tool_change("Ajoute Google Sheets pour ma comptabilité") is True
    assert prompt_implies_tool_change("Change le ton en amical") is False


def test_should_interrupt_first_build_even_without_apps():
    caps: dict = {}
    proposed = [ToolBinding(tool_id="web_search", provider="native")]
    assert (
        should_interrupt_tool_review(
            capabilities=caps,
            proposed=proposed,
            current=None,
            prompt="Agent comptabilité",
            is_first_build=True,
        )
        is True
    )


def test_should_interrupt_skips_when_tools_confirmed():
    caps = {
        "tools_confirmed": True,
        "confirmed_spec": {"goal": "x", "tools": []},
    }
    assert (
        should_interrupt_tool_review(
            capabilities=caps,
            proposed=[],
            current=None,
            prompt="anything",
            is_first_build=False,
        )
        is False
    )


def test_should_interrupt_post_ready_tool_intent():
    caps: dict = {}
    proposed = [ToolBinding(tool_id="web_search", provider="native")]
    current = [ToolBinding(tool_id="web_search", provider="native")]
    assert (
        should_interrupt_tool_review(
            capabilities=caps,
            proposed=proposed,
            current=current,
            prompt="Ajoute Gmail pour lire les factures",
            is_first_build=False,
        )
        is True
    )


def test_should_interrupt_post_ready_when_apps_change():
    current = [ToolBinding(tool_id="gmail_send", provider="pipedream", app_id="gmail")]
    proposed = current + [
        ToolBinding(tool_id="sheets_update", provider="pipedream", app_id="google_sheets")
    ]
    assert (
        should_interrupt_tool_review(
            capabilities={},
            proposed=proposed,
            current=current,
            prompt="Continue",
            is_first_build=False,
        )
        is True
    )
