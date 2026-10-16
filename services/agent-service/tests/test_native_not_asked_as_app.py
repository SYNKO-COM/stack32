"""Never ask which SaaS app provides something the platform already does.

Asking an agent to stamp its Slack summary with the time stopped the build on
a form: "Choisissez l'app pour « current datetime »" — for a tool Stack32
ships natively and that this agent already had. Deriving the exclusions from
the native catalogue keeps them true as it grows.
"""

from __future__ import annotations

import pytest

from agent_service.builder.capabilities import extract_external_app_queries


@pytest.mark.parametrize(
    "hint",
    ["current_datetime", "current datetime", "currentdatetime", "web_search", "knowledge_search"],
)
def test_a_native_capability_is_never_an_app_query(hint):
    assert extract_external_app_queries("modifie le resume", llm_hints=[hint]) == []


def test_a_real_app_still_becomes_a_query():
    assert "notion" in extract_external_app_queries("ajoute notion", llm_hints=["notion"])


def test_a_native_word_does_not_block_a_real_app_beside_it():
    out = extract_external_app_queries(
        "horodate et publie", llm_hints=["current_datetime", "notion"]
    )
    assert out == ["notion"]


def test_a_multi_word_hint_starting_native_is_dropped():
    """"current datetime tool" must not fall back to the token `current`."""
    assert extract_external_app_queries("x", llm_hints=["current datetime tool"]) == []


def test_the_timestamp_request_that_broke_the_build():
    """Slack is a real app and stays; the native clock must not be asked about."""
    prompt = (
        "termine chaque resume Slack par 'Traite automatiquement par Orchestrateur "
        "Support' suivie de la date et de l'heure du traitement"
    )
    out = extract_external_app_queries(prompt, llm_hints=["current_datetime"])
    assert "slack_v2" in out
    assert not any("datetime" in q or q == "current" for q in out)


@pytest.mark.asyncio
async def test_the_clarification_form_refuses_a_native_capability():
    """Belt and braces: the guard sits at the form itself, not only upstream."""
    from agent_service.builder.capabilities import resolve_pipedream_app

    ambiguous: list = []

    async def never_called(*a, **k):  # pragma: no cover - must not run
        raise AssertionError("the catalogue should not be searched for a native tool")

    out = await resolve_pipedream_app(
        app_query="current_datetime",
        prompt="horodate le resume",
        registry=object(),
        search=never_called,
        add_binding=lambda b: None,
        ambiguous=ambiguous,
    )
    assert out is None
    assert ambiguous == []
