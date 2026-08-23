"""An agent should only be offered what its mission actually calls for.

Two keywords were pulling in apps nobody asked for. "automatiquement" sat in
the email list, so every agent that "se déclenche automatiquement" was offered
Gmail. And a bare "event" matched our own trigger note — "Event trigger: New
Message (Instant) on app discord" — so an agent watching a chat room was
offered Calendar. Both had to be declined by hand before the build could go on.
"""

from __future__ import annotations

import pytest

from agent_service.builder.capabilities import build_capability_plan

DISCORD_MISSION = (
    "Cree un agent qui se declenche automatiquement des qu'un nouveau message arrive "
    "dans mon salon Discord, cree une carte Trello, enregistre dans Airtable, redige "
    "dans Notion, publie un resume dans Slack."
)
TRIGGER_NOTE = "Event trigger: New Message (Instant) on app discord."


def names(text: str) -> list[str]:
    return [getattr(c, "name", str(c)) for c in build_capability_plan(text).to_capabilities()]


def test_automation_alone_does_not_summon_email():
    assert "Email / Gmail" not in names(DISCORD_MISSION)


def test_our_own_trigger_note_does_not_summon_the_calendar():
    assert "Calendar" not in names(f"{DISCORD_MISSION} {TRIGGER_NOTE}")


def test_the_mission_still_gets_every_app_it_names():
    got = names(DISCORD_MISSION)
    for app in ("Ext:Airtable", "Ext:Discord", "Ext:Notion", "Ext:Trello"):
        assert app in got


@pytest.mark.parametrize(
    "mission",
    [
        "surveille ma boite mail et redige des reponses",
        "envoie un email de relance aux prospects",
        "trie mon inbox Gmail chaque matin",
    ],
)
def test_a_real_email_mission_still_gets_email(mission):
    assert "Email / Gmail" in names(mission)


@pytest.mark.parametrize(
    "mission",
    [
        "planifie un meeting avec le client",
        "verifie mon agenda avant de repondre",
        "cree un calendar event pour chaque demande",
        "prends les rdv automatiquement",
    ],
)
def test_a_real_calendar_mission_still_gets_the_calendar(mission):
    assert "Calendar" in names(mission)


def test_an_automated_email_agent_gets_both_signals():
    """Automation no longer implies email, but it must not suppress it either."""
    assert "Email / Gmail" in names("reponds automatiquement aux emails entrants")
