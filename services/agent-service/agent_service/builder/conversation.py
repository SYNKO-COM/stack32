"""Conservative turn routing and evidence for the Builder conversation."""
from __future__ import annotations

import re
import unicodedata
from typing import Any


def normalise(text: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", text.lower()) if not unicodedata.combining(c))


def reply_locale(text: str, fallback: str = "en") -> str:
    message = normalise(text)
    if re.search(r"(?:respond|reply|answer|reponds|repondre|reponses?).{0,25}(?:in english|en anglais)", message):
        return "en"
    if re.search(r"(?:respond|reply|answer|reponds|repondre|reponses?).{0,25}(?:in french|en francais)", message):
        return "fr"
    french = re.findall(r"\b(?:je|tu|peux|pourrais|quels|quelles|outil|outils|creer|cree|modifie|ajoute|explique|bonjour|pourquoi|comment|francais|agent|avec)\b", message)
    # Agent is shared by both languages; never let that word choose a locale.
    if len([word for word in french if word != "agent"]) >= 2:
        return "fr"
    return "fr" if fallback.lower().startswith("fr") else "en"


def is_read_only_question(text: str) -> bool:
    message = normalise(text).strip()
    # Only unambiguous requests to explain/inspect. Mixed question + edit stays Build.
    mutation = r"\b(?:create|build|add|remove|delete|change|modify|connect|configure|repair|fix|cree|creer|ajoute|ajouter|supprime|supprimer|modifie|modifier|branche|connecte|configure|repare|corrige|remplace)\b"
    if re.search(mutation, message):
        return False
    return bool(re.search(
        r"^(?:(?:s['’]il te plait|please|peux.tu|pourrais.tu|can you|could you)\s*[,?:]?\s*)*"
        r"(?:explain|describe|summari[sz]e|list|tell me|show me|what|which|why|how|"
        r"explique|decris|resume|recapitule|fais.{0,12}recapitulatif|me faire.{0,12}recapitulatif|"
        r"quels|quelles|quel|quelle|pourquoi|comment|a quoi|est.ce que)\b", message))


def operation(text: str, agent: dict[str, Any]) -> str:
    message = normalise(text)
    # A noun in “create a test agent” is not an instruction to test an existing one.
    if re.search(r"\b(?:repair|fix|repare|corrige)\b", message):
        return "repair"
    if re.match(r"^(?:please\s+)?(?:test|teste|tester|run (?:the|a) test|lance (?:un|le) test)\b", message.strip()):
        return "test"
    if agent.get("status") in {"ready", "built", "published", "needs_attention", "needs_setup"} or agent.get("first_ready_celebrated"):
        return "modify"
    return "create"


def spec_changes(before: Any, after: Any) -> dict[str, Any]:
    previous = before.model_dump(mode="json") if before else {}
    current = after.model_dump(mode="json")
    changed = [key for key, value in current.items() if previous.get(key) != value]
    old_tools = {t.tool_id for t in before.tools if t.enabled} if before else set()
    tools = [t.tool_id for t in after.tools if t.enabled]
    return {
        "changed_sections": changed,
        "tools_added": [t for t in tools if t not in old_tools],
        "tools_removed": sorted(old_tools - set(tools)),
        "enabled_tools": tools,
        "goal": after.goal,
        "instructions": after.instructions.system[:5000],
        "connections_required": [r.model_dump(mode="json") for r in after.connection_requirements],
        "connection_status": "Not checked here. A tool definition is not a connected account.",
    }
