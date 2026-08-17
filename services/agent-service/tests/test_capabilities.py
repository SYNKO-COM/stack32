"""Builder capability extraction + tool resolution."""

from __future__ import annotations

import pytest

from agent_service.builder.capabilities import (
    extract_capabilities,
    extract_external_app_queries,
    resolve_tools_for_capabilities,
)


def test_extract_email_and_research():
    caps = extract_capabilities("Build an agent that reads my gmail and researches companies online")
    ids = {c.id for c in caps}
    assert "email" in ids
    assert "research" in ids


def test_extract_calendar():
    caps = extract_capabilities("Schedule meetings on my calendar and list upcoming events")
    assert any(c.id == "calendar" for c in caps)


def test_extract_external_apps_notion_stripe():
    apps = extract_external_app_queries(
        "Connect Notion and Stripe to invoice customers and save notes"
    )
    assert "notion" in apps
    assert "stripe" in apps


def test_extract_external_apps_from_llm_hints():
    apps = extract_external_app_queries("Help me", llm_hints=["hubspot", "airtable"])
    assert "hubspot" in apps
    assert "airtable" in apps


def test_extract_google_docs():
    caps = extract_capabilities(
        "Crée un Google Docs résumé et mets-le à jour à chaque devoir"
    )
    ids = {c.id for c in caps}
    assert "google_docs" in ids


@pytest.mark.asyncio
async def test_resolve_google_docs_tools():
    prompt = "Create a Google Doc summary and update it each time"
    caps = extract_capabilities(prompt)
    tools, reqs, _ = await resolve_tools_for_capabilities(caps, prompt=prompt)
    ids = {t.tool_id for t in tools}
    assert "google_docs_create" in ids
    assert "google_docs_append" in ids
    assert any(r.provider == "pipedream" for r in reqs)


def test_extract_slack():
    caps = extract_capabilities("Post updates to Slack channels")
    assert any(c.id == "slack" for c in caps)


def test_writing_only_empty_integrations():
    caps = extract_capabilities("Help me rewrite blog posts with a friendly tone")
    ids = {c.id for c in caps}
    assert "writing" in ids
    assert "email" not in ids
    assert "research" not in ids


def test_llm_hints_merge():
    caps = extract_capabilities("Help me", llm_hints=["gmail", "calendar"])
    ids = {c.id for c in caps}
    assert "email" in ids
    assert "calendar" in ids


@pytest.mark.asyncio
async def test_resolve_email_prefers_draft_over_send():
    caps = extract_capabilities("Draft emails in Gmail for follow-ups")
    tools, reqs, _amb = await resolve_tools_for_capabilities(caps, prompt="Draft emails in Gmail")
    ids = [t.tool_id for t in tools]
    assert "gmail_create_draft" in ids
    assert "gmail_list" in ids or "gmail_read" in ids
    assert all(t.provider == "native" for t in tools if t.tool_id.startswith("gmail_"))
    assert any(r.provider == "pipedream" for r in reqs)


@pytest.mark.asyncio
async def test_resolve_email_send_keyword():
    prompt = "Send emails via Gmail when I ask"
    caps = extract_capabilities(prompt)
    tools, reqs, _ = await resolve_tools_for_capabilities(caps, prompt=prompt)
    ids = {t.tool_id for t in tools}
    assert "gmail_send_message" in ids
    assert reqs


@pytest.mark.asyncio
async def test_resolve_writing_only_builtins():
    caps = extract_capabilities("Just write marketing copy for me")
    tools, reqs, amb = await resolve_tools_for_capabilities(
        caps, prompt="Just write marketing copy for me"
    )
    ids = {t.tool_id for t in tools}
    assert ids <= {"current_datetime", "structured_output"}
    assert reqs == []
    assert amb == []


@pytest.mark.asyncio
async def test_resolve_research_tools():
    caps = extract_capabilities("Research competitors on the web")
    tools, reqs, _ = await resolve_tools_for_capabilities(
        caps, prompt="Research competitors on the web"
    )
    ids = {t.tool_id for t in tools}
    assert "web_search" in ids
    assert "fetch_url" in ids
    assert reqs == []


@pytest.mark.asyncio
async def test_v4_bindings_have_provider_fields():
    caps = extract_capabilities("Check my inbox and calendar")
    tools, _, _ = await resolve_tools_for_capabilities(
        caps, prompt="Check my inbox and calendar"
    )
    gmail = next(t for t in tools if t.tool_id.startswith("gmail_"))
    assert gmail.provider == "native"


@pytest.mark.asyncio
async def test_gmail_and_calendar_are_separate_connection_requirements():
    caps = extract_capabilities("Check my Gmail inbox and Google Calendar")
    _tools, reqs, _ = await resolve_tools_for_capabilities(
        caps, prompt="Check my Gmail inbox and Google Calendar"
    )
    app_ids = {r.app_id for r in reqs}
    assert "gmail" in app_ids
    assert "google_calendar" in app_ids
    assert "google" not in app_ids


def test_capability_plan_outlook_prefers_pipedream():
    from agent_service.builder.capabilities import build_capability_plan

    plan = build_capability_plan("Send emails with Outlook when I ask")
    email = next(c for c in plan.capabilities if c.id == "email")
    assert email.preferred_app in {"microsoft_outlook", "outlook"}
    assert email.provider_preference == "pipedream"
    assert "email_provider" not in plan.ambiguities


def test_capability_plan_ambiguous_email():
    from agent_service.builder.capabilities import build_capability_plan

    plan = build_capability_plan("Help me manage my email inbox")
    assert "email_provider" in plan.ambiguities


def test_capability_plan_ambiguous_crm():
    from agent_service.builder.capabilities import build_capability_plan

    plan = build_capability_plan("Log every new lead into my CRM")
    assert "crm_provider" in plan.ambiguities


def test_capability_plan_named_crm_not_ambiguous():
    from agent_service.builder.capabilities import build_capability_plan

    plan = build_capability_plan("Log every new lead into HubSpot CRM")
    assert "crm_provider" not in plan.ambiguities


@pytest.mark.asyncio
async def test_resolve_surfaces_crm_provider_group():
    from agent_service.builder.capabilities import resolve_tools_for_capabilities

    _tools, _reqs, ambiguous = await resolve_tools_for_capabilities(
        [], prompt="Update contacts in my CRM"
    )
    crm = next((a for a in ambiguous if a.get("group") == "crm"), None)
    assert crm is not None
    tool_ids = {c["tool_id"] for c in crm["choices"]}
    assert {"hubspot", "salesforce", "pipedrive", "zoho_crm"} <= tool_ids


def test_email_send_only_least_privilege():
    from agent_service.builder.capabilities import _email_tool_ids

    ids = _email_tool_ids("send emails via gmail when i ask")
    assert ids == ["gmail_send_message"]


@pytest.mark.asyncio
async def test_calendar_list_only_no_create():
    caps = extract_capabilities("List my upcoming calendar events")
    tools, _, _ = await resolve_tools_for_capabilities(
        caps, prompt="List my upcoming calendar events"
    )
    ids = {t.tool_id for t in tools}
    assert "calendar_list" in ids
    assert "calendar_create_event" not in ids


@pytest.mark.asyncio
async def test_ambiguous_email_skips_gmail_without_preferred_apps():
    from agent_service.builder.capabilities import resolve_tools_for_capabilities

    tools, _reqs, ambiguous = await resolve_tools_for_capabilities(
        [], prompt="Help me manage my email inbox"
    )
    assert any(a.get("group") == "email" for a in ambiguous)
    gmail_tools = [t for t in tools if t.tool_id.startswith("gmail_")]
    assert gmail_tools == []


@pytest.mark.asyncio
async def test_explicit_gmail_and_hubspot_skips_clarification():
    from agent_service.builder.capabilities import build_capability_plan, resolve_tools_for_capabilities

    prompt = "Use Gmail for email and HubSpot for CRM"
    plan = build_capability_plan(prompt)
    assert "email_provider" not in plan.ambiguities
    assert "crm_provider" not in plan.ambiguities
    _tools, _reqs, ambiguous = await resolve_tools_for_capabilities(
        plan.to_capabilities(),
        prompt=prompt,
        plan=plan,
        preferred_apps=["gmail", "hubspot"],
    )
    assert not any(a.get("group") == "email" for a in ambiguous)


def test_extract_canva_not_canvas():
    apps = extract_external_app_queries(
        "crée une présentation Canva en format paysage avec les infos de la boîte"
    )
    assert "canva" in apps
    assert "canvas" not in apps
    assert "gocanvas" not in apps


def test_pick_pipedream_app_prefers_exact_canva():
    from agent_service.builder.capabilities import pick_pipedream_app

    apps = [
        {"app_id": "canvas", "name": "Canvas"},
        {"app_id": "gocanvas", "name": "GoCanvas"},
        {"app_id": "canva", "name": "Canva"},
    ]
    chosen, _cands, reason = pick_pipedream_app("canva", apps)
    assert chosen == "canva"
    assert reason is None


def test_pick_pipedream_app_ambiguous_without_exact_canva():
    from agent_service.builder.capabilities import pick_pipedream_app

    apps = [
        {"app_id": "canvas", "name": "Canvas"},
        {"app_id": "gocanvas", "name": "GoCanvas"},
    ]
    chosen, cands, reason = pick_pipedream_app("canva", apps)
    assert chosen is None
    assert reason == "ambiguous_app"
    slugs = {str(c.get("app_id")) for c in cands}
    assert "canvas" in slugs or "gocanvas" in slugs


def test_pick_pipedream_app_never_autobinds_first_hit():
    from agent_service.builder.capabilities import pick_pipedream_app

    apps = [
        {"app_id": "canvas", "name": "Canvas by Instructure"},
        {"app_id": "gocanvas", "name": "GoCanvas"},
    ]
    chosen, _cands, reason = pick_pipedream_app("canva", apps)
    assert chosen is None
    assert reason == "ambiguous_app"


def test_merge_tools_on_edit_preserves_notion():
    from agent_service.builder.capabilities import merge_tools_on_edit
    from agent_service.models.agent_spec import ToolBinding

    current = [
        ToolBinding(tool_id="current_datetime", provider="native"),
        ToolBinding(tool_id="web_search", provider="native"),
        ToolBinding(tool_id="calendar_create_event", provider="native", app_id="google_calendar"),
        ToolBinding(tool_id="pd:notion-create-page", provider="pipedream", app_id="notion"),
        ToolBinding(tool_id="pd:canvas-create", provider="pipedream", app_id="canvas"),
        ToolBinding(tool_id="pd:gocanvas-submit", provider="pipedream", app_id="gocanvas"),
    ]
    incoming = [
        ToolBinding(tool_id="current_datetime", provider="native"),
        ToolBinding(tool_id="pd:canva-create-design", provider="pipedream", app_id="canva"),
    ]
    merged = merge_tools_on_edit(
        current,
        incoming,
        edit_prompt="Tu t'es trompé d'outils canva je veux celui pour faire des design juste cet outil",
    )
    ids = {t.tool_id for t in merged}
    apps = {t.app_id for t in merged if t.app_id}
    assert "pd:notion-create-page" in ids
    assert "calendar_create_event" in ids
    assert "web_search" in ids
    assert "pd:canva-create-design" in ids
    assert "canva" in apps
    assert "canvas" not in apps
    assert "gocanvas" not in apps


def test_is_surgical_tool_edit_detects_fix_canva():
    from agent_service.builder.capabilities import is_surgical_tool_edit

    assert is_surgical_tool_edit(
        "Tu t'es trompé d'outils canva je veux celui que je t'ai envoyé en photo",
        current_tool_count=5,
    )


def test_slug_from_website_canva():
    from agent_service.builder.capabilities import slug_from_website

    assert slug_from_website("https://www.canva.com/") == "canva"
    assert slug_from_website("notion.so") == "notion"


def test_blocking_ambiguities_respects_preferred_canva():
    from agent_service.builder.capabilities import blocking_ambiguities

    ambiguous = [
        {
            "reason": "ambiguous_app",
            "app_query": "canva",
            "choices": [
                {"tool_id": "canva"},
                {"tool_id": "canvas"},
                {"tool_id": "gocanvas"},
            ],
        }
    ]
    assert blocking_ambiguities(ambiguous, preferred_apps=["canva"]) == []
    assert len(blocking_ambiguities(ambiguous, preferred_apps=None)) == 1


def test_tool_belongs_to_canva_rejects_canvas_and_gocanvas():
    from types import SimpleNamespace

    from agent_service.builder.capabilities import _tool_belongs_to_app

    assert _tool_belongs_to_app(
        SimpleNamespace(tool_id="pd:canva-create-design", provider_app_id=None), "canva"
    )
    assert _tool_belongs_to_app(
        SimpleNamespace(tool_id="pd:canva-export-design", provider_app_id="canva"), "canva"
    )
    assert not _tool_belongs_to_app(
        SimpleNamespace(tool_id="pd:canvas-list-account-id-options", provider_app_id=None),
        "canva",
    )
    assert not _tool_belongs_to_app(
        SimpleNamespace(tool_id="pd:gocanvas-list-form-options", provider_app_id=None),
        "canva",
    )
    assert not _tool_belongs_to_app(
        SimpleNamespace(tool_id="pd:canvas-list-account-id-options", provider_app_id="canvas"),
        "canva",
    )


def test_envoie_infos_does_not_mean_email():
    caps = extract_capabilities(
        "quand je lui envoie les infos d'une boîte et une présentation Canva"
    )
    ids = {c.id for c in caps}
    assert "email" not in ids
    apps = extract_external_app_queries(
        "quand je lui envoie les infos d'une boîte et une présentation Canva"
    )
    assert "canva" in apps
    assert "canvas" not in apps


def test_google_sheet_singular_maps_and_pappers_are_detected():
    apps = extract_external_app_queries(
        "Save to a Google Sheet, look up companies on Pappers.com, and search Google Maps"
    )
    assert "google_sheets" in apps
    assert "pappers" in apps
    assert "google_maps" in apps
