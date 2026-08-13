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
    assert any(r.provider == "google" for r in reqs)


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
    assert any(r.provider == "google" for r in reqs)


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
