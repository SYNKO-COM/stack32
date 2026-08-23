"""An agent must leave the builder able to do every part of its mission.

"Surveille ma boîte Gmail, détecte les emails de prospects, et rédige
automatiquement un brouillon de réponse" needs to read an inbox *and* write a
draft. The plan matched no French verb at all, fell back to its defaults, and
searched the bare app name — which returned signature and alias management.
The built agent could not read a single message, and said so.
"""

from __future__ import annotations

import pytest

from agent_service.builder.capabilities import _intent_verbs

MISSION = (
    "cree un agent qui surveille ma boite gmail, detecte les emails de "
    "prospects, et redige automatiquement un brouillon de reponse personnalise"
)


def test_the_original_mission_yields_read_and_write_intents():
    verbs = _intent_verbs(MISSION)
    assert "find" in verbs, "watching an inbox is a read intent"
    assert "draft" in verbs, "writing a reply draft is a draft intent"


@pytest.mark.parametrize(
    "prompt,expected",
    [
        ("surveille ma boite mail", "find"),
        ("détecte les nouveaux messages", "find"),
        ("recherche les factures", "find"),
        ("rédige un brouillon de réponse", "draft"),
        ("prepare une reponse", "draft"),
        ("envoie un message sur slack", "send"),
        ("réponds automatiquement", "send"),
        ("supprime les vieux emails", "delete"),
        ("archive les messages traités", "delete"),
        ("met à jour la fiche client", "update"),
    ],
)
def test_french_missions_are_understood(prompt, expected):
    assert expected in _intent_verbs(prompt)


def test_english_missions_still_work():
    verbs = _intent_verbs("watch my inbox, find prospects and draft a reply")
    assert "find" in verbs
    assert "draft" in verbs


def test_a_mission_with_no_verb_falls_back_to_reading_first():
    """Reading is the safest default: it cannot change anything."""
    assert _intent_verbs("un agent pour mes clients")[0] == "find"


def test_intents_are_not_duplicated():
    verbs = _intent_verbs("cherche, recherche et trouve les emails")
    assert len(verbs) == len(set(verbs))
