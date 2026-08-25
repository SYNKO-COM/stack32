"""A complaint about a broken agent must not become a blind code rewrite.

A user whose agent stayed silent wrote "il y a un bug". The builder treated it
as a modify request and had the coding agent rewrite working files, while the
real cause was that no LLM key had been connected. Code changes cannot fix a
missing connection: the turn has to look at the configuration first, and say
so when that is where the fault is.
"""

from __future__ import annotations

import pytest

from agent_service.builder.problem_triage import (
    TriageResult,
    compose_triage_reply,
    triage_reported_problem,
)


class _Check:
    def __init__(self, key: str, ok: bool) -> None:
        self.key = key
        self.ok = ok
        self.message = ""
        self.severity = "error"


class _Readiness:
    def __init__(self, checks=None, missing_connections=None, missing_config=None) -> None:
        self.status = "needs_setup"
        self.checks = checks or []
        self.missing_connections = missing_connections or []
        self.missing_config = missing_config or []


class _Reply:
    def __init__(self, content: str) -> None:
        self.content = content


class _Gateway:
    """Answers the complaint classifier with whatever the test wants."""

    def __init__(self, complaint) -> None:
        self._complaint = complaint
        self.calls = 0

    async def complete(self, **_kwargs):
        self.calls += 1
        if isinstance(self._complaint, Exception):
            raise self._complaint
        return _Reply('{"complaint": %s}' % ("true" if self._complaint else "false"))


#: Stand-ins for objects the triage only passes through.
_ANY_SPEC = object()
_ANY_DB = object()


@pytest.fixture
def patch_readiness(monkeypatch):
    def _apply(readiness):
        async def _fake(**_kwargs):
            return readiness

        monkeypatch.setattr(
            "agent_service.readiness.evaluator.evaluate_installation_readiness",
            _fake,
        )

    return _apply


async def _triage(gateway, spec=_ANY_SPEC):
    return await triage_reported_problem(
        db=_ANY_DB,
        gateway=gateway,
        user_id="u1",
        agent_id="a1",
        content="ça ne marche pas, il y a un bug",
        spec=spec,
        locale="fr",
    )


class TestItStopsBeforeTouchingCode:
    @pytest.mark.asyncio
    async def test_a_missing_llm_key_is_reported_not_coded_around(self, patch_readiness):
        patch_readiness(_Readiness(checks=[_Check("brain", ok=False)]))
        result = await _triage(_Gateway(complaint=True))
        assert result is not None
        assert result.causes == ["brain"]
        assert "clé LLM" in result.findings[0]

    @pytest.mark.asyncio
    async def test_an_unconnected_app_is_reported(self, patch_readiness):
        patch_readiness(_Readiness(missing_connections=[{"app_id": "gmail"}]))
        result = await _triage(_Gateway(complaint=True))
        assert result is not None
        assert result.causes == ["connection"]
        assert "gmail" in result.findings[0]

    @pytest.mark.asyncio
    async def test_an_empty_required_setting_is_reported(self, patch_readiness):
        patch_readiness(_Readiness(missing_config=[{"tool_id": "gmail_send"}]))
        result = await _triage(_Gateway(complaint=True))
        assert result is not None
        assert result.causes == ["tool_config"]


class TestItGetsOutOfTheWay:
    @pytest.mark.asyncio
    async def test_sound_configuration_lets_the_build_proceed(self, patch_readiness):
        patch_readiness(_Readiness(checks=[_Check("brain", ok=True)]))
        assert await _triage(_Gateway(complaint=True)) is None

    @pytest.mark.asyncio
    async def test_a_request_for_a_change_is_never_triaged(self, patch_readiness):
        patch_readiness(_Readiness(checks=[_Check("brain", ok=False)]))
        assert await _triage(_Gateway(complaint=False)) is None

    @pytest.mark.asyncio
    async def test_a_classifier_failure_never_blocks_the_build(self, patch_readiness):
        patch_readiness(_Readiness(checks=[_Check("brain", ok=False)]))
        assert await _triage(_Gateway(complaint=RuntimeError("model down"))) is None

    @pytest.mark.asyncio
    async def test_an_agent_with_no_spec_is_left_alone(self):
        gateway = _Gateway(complaint=True)
        assert await _triage(gateway, spec=None) is None
        assert gateway.calls == 0


class TestTheReplyIsHonest:
    def test_it_says_the_code_was_not_touched(self):
        reply = compose_triage_reply(
            TriageResult(causes=["brain"], findings=["Aucune clé LLM n'est connectée."]),
            "fr",
        )
        assert "Rien n'a été modifié dans le code" in reply
        assert "Aucune clé LLM n'est connectée." in reply

    def test_english_locale_answers_in_english(self):
        reply = compose_triage_reply(
            TriageResult(causes=["brain"], findings=["No LLM key is connected."]), "en"
        )
        assert "Nothing in the code was changed" in reply
