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
    # “Ne modifie rien” is a prohibition, not an edit instruction.
    message = re.sub(
        r"\b(?:ne (?:modifie|change|supprime|cree|ajoute|connecte) (?:rien|pas)|"
        r"sans (?:rien )?(?:modifier|changer|supprimer|creer|ajouter|connecter)(?: quoi que ce soit)?|"
        r"(?:do not|don't|without) (?:modify|modifying|change|changing|edit|editing|add|adding|delete|deleting|connect|connecting)(?: anything)?)\b",
        "", message,
    )
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
        "prohibited_actions": after.instructions.prohibited_actions,
        "behavioural_rules": after.instructions.behavioral_rules,
        "triggers": [
            {k: v for k, v in trigger.model_dump(mode="json").items()
             if k in {"kind", "enabled", "cron", "timezone", "app_id", "component_id"}}
            for trigger in after.triggers
        ],
        "approvals": after.approvals.model_dump(mode="json"),
        "enabled_tool_details": [
            {"tool_id": tool.tool_id, "provider": tool.provider, "approval_mode": tool.approval_mode}
            for tool in after.tools if tool.enabled
        ],
        "connections_required": [r.model_dump(mode="json") for r in after.connection_requirements],
        "connection_status": "Not checked here. A tool definition is not a connected account.",
    }


def needs_question_routing(text: str) -> bool:
    """Ambiguous conversational turns get a semantic check before any mutation."""
    if "?" in text:
        return True
    return bool(re.match(
        r"^(?:please |s['’]il te plait[, ]+)?(?:explain|describe|summari[sz]e|tell me|"
        r"can you|could you|would you|what|which|why|how|explique|decris|resume|"
        r"peux.tu|pourrais.tu|tu peux|est.ce que|quels|quelles|pourquoi|comment|"
        r"je voudrais savoir|j['’]aimerais comprendre)\b", normalise(text).strip()))


def status_after_builder_cancel(run: dict, agent: dict) -> str | None:
    """Stopping a read-only answer must never mark a broken agent as ready."""
    payload = run.get("input") or {}
    if payload.get("mode") == "chat":
        return None
    previous = payload.get("agent_status_before")
    if previous in {"draft", "built", "ready", "needs_setup", "needs_attention", "published", "archived"}:
        return str(previous)
    current = agent.get("status")
    if current in {"built", "ready", "needs_setup", "needs_attention", "published", "archived"}:
        return str(current)
    return "ready" if agent.get("first_ready_celebrated") else "draft"
