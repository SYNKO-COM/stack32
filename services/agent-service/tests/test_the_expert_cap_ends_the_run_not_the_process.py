"""The external-expert cap must end the run gracefully, never crash it.

The cap compared against ``self.settings.MAX_EXTERNAL_EXPERT_CALLS`` — an
attribute nothing ever initialized. The one safety net written to stop an
expensive escalation raised AttributeError the moment it was needed, on the
rare path where a build had already burned through every cheaper rung.
"""

from __future__ import annotations

from agent_service.builder.coding.agent import CodingAgent


class _Provider:
    pass


class _Handle:
    workspace_id = "ws-test"


class _Engine:
    pass


def _agent() -> CodingAgent:
    return CodingAgent(provider=_Provider(), handle=_Handle(), engine=_Engine())


class TestTheSettingsHandleExists:
    def test_the_agent_carries_settings_from_birth(self):
        agent = _agent()
        assert agent.settings is not None

    def test_the_expert_cap_is_readable(self):
        agent = _agent()
        # The exact attribute the escalation path reads under pressure.
        assert isinstance(agent.settings.MAX_EXTERNAL_EXPERT_CALLS, int)
        assert agent.settings.MAX_EXTERNAL_EXPERT_CALLS >= 1

    def test_max_turns_still_follows_settings(self):
        agent = _agent()
        assert agent.max_turns == agent.settings.CODING_MAX_TURNS
