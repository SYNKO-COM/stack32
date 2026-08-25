"""A reported problem is diagnosed before any code is touched.

Someone whose agent will not answer types "ça ne marche pas, il y a un bug".
The builder classified that as MODIFY and sent the coding agent at the source
— which rewrote working files because the real cause was that no LLM key had
been connected, or an app was left unlinked, or a required setting was still
empty. Editing code cannot fix a missing connection, so the agent came back
"repaired" and just as broken, a credit lighter.

This module runs first. It asks a small model whether the message is a
complaint about behaviour (not a request for a change), and if so it reads the
agent's real configuration through the readiness evaluator — the same
deterministic checks the Structure view shows. When something concrete is
missing, the turn answers with that diagnosis and leaves the code alone. When
configuration is sound, it returns None and the normal pipeline proceeds.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)

#: A complaint is short. Beyond this the message is carrying instructions too,
#: so let the normal pipeline read it rather than triaging on a keyword.
MAX_COMPLAINT_CHARS = 600


@dataclass
class TriageResult:
    """A configuration cause found for a reported problem."""

    #: Machine-readable causes, e.g. "brain", "connection", "tool_config".
    causes: list[str] = field(default_factory=list)
    #: One user-facing line per cause, already in the person's language.
    findings: list[str] = field(default_factory=list)

    @property
    def has_cause(self) -> bool:
        return bool(self.findings)


_COMPLAINT_SYSTEM = (
    "You read one message a person sent about an AI agent they own.\n"
    "Answer strictly as JSON: {\"complaint\": true|false}.\n"
    "complaint = true when the message REPORTS that something is broken, "
    "failing, erroring, not answering or not working, without describing a "
    "change to make.\n"
    "complaint = false when the message asks for a new behaviour, a change, "
    "an addition, a removal, or asks a question about how something works.\n"
    "No prose, JSON only."
)


async def _looks_like_complaint(gateway: Any, content: str) -> bool:
    """Ask a small model; on any failure assume it is not a complaint."""
    text = (content or "").strip()
    if not text or len(text) > MAX_COMPLAINT_CHARS:
        return False
    from agent_service.gateway.model_gateway import ModelProfile

    try:
        result = await gateway.complete(
            profile=ModelProfile.FAST,
            messages=[
                {"role": "system", "content": _COMPLAINT_SYSTEM},
                {"role": "user", "content": text},
            ],
            temperature=0.0,
            max_tokens=32,
        )
        reply = result.content if hasattr(result, "content") else str(result)
    except Exception:  # noqa: BLE001
        logger.debug("problem_triage_classify_failed", exc_info=True)
        return False
    raw = (reply or "").strip()
    start, end = raw.find("{"), raw.rfind("}")
    if start < 0 or end <= start:
        return False
    try:
        return bool(json.loads(raw[start : end + 1]).get("complaint"))
    except Exception:  # noqa: BLE001
        return False


def _finding_for_brain(locale: str) -> str:
    if locale.startswith("fr"):
        return (
            "Aucune clé LLM n'est connectée : l'agent n'a pas de cerveau pour "
            "répondre. Ouvrez la vue Agent IA, choisissez un fournisseur et "
            "connectez votre compte avec Pipedream."
        )
    return (
        "No LLM key is connected, so the agent has no brain to answer with. "
        "Open the AI Agent view, pick a provider and connect your account "
        "with Pipedream."
    )


def _finding_for_connection(label: str, locale: str) -> str:
    if locale.startswith("fr"):
        return f"L'app {label} n'est pas connectée — l'agent ne peut pas l'utiliser."
    return f"{label} is not connected — the agent cannot use it."


def _finding_for_config(label: str, locale: str) -> str:
    if locale.startswith("fr"):
        return f"Un réglage obligatoire de {label} est encore vide."
    return f"A required setting for {label} is still empty."


def _label(entry: Any, *keys: str) -> str:
    if isinstance(entry, dict):
        for key in keys:
            value = entry.get(key)
            if value:
                return str(value)
    elif entry:
        return str(entry)
    return "this app"


async def triage_reported_problem(
    *,
    db: Any,
    gateway: Any,
    user_id: str,
    agent_id: str,
    content: str,
    spec: Any,
    locale: str = "en",
) -> TriageResult | None:
    """Return a configuration diagnosis, or None to let the build proceed."""
    if spec is None:
        return None
    if not await _looks_like_complaint(gateway, content):
        return None

    try:
        from agent_service.readiness.evaluator import evaluate_installation_readiness

        readiness = await evaluate_installation_readiness(
            agent_id=agent_id,
            user_id=user_id,
            spec=spec,
            db=db,
        )
    except Exception:  # noqa: BLE001
        logger.exception("problem_triage_readiness_failed agent=%s", agent_id)
        return None

    result = TriageResult()

    for check in readiness.checks or []:
        if getattr(check, "key", "") == "brain" and not getattr(check, "ok", True):
            result.causes.append("brain")
            result.findings.append(_finding_for_brain(locale))
            break

    for miss in (readiness.missing_connections or [])[:3]:
        result.causes.append("connection")
        result.findings.append(
            _finding_for_connection(_label(miss, "app_id", "provider", "tool_id"), locale)
        )

    for cfg in (readiness.missing_config or [])[:3]:
        if isinstance(cfg, dict) and cfg.get("type") == "brain":
            continue  # already covered by the brain check
        result.causes.append("tool_config")
        result.findings.append(_finding_for_config(_label(cfg, "tool_id", "key"), locale))

    return result if result.has_cause else None


def compose_triage_reply(result: TriageResult, locale: str) -> str:
    """The diagnosis, said plainly, with no pretence that code was changed."""
    if locale.startswith("fr"):
        head = (
            "J'ai regardé avant de toucher au code : le problème ne vient pas "
            "de l'agent, mais de sa configuration."
        )
        tail = (
            "Rien n'a été modifié dans le code. Corrigez le point ci-dessus, "
            "réessayez, et dites-moi si le problème persiste — je chercherai "
            "alors dans le code."
        )
    else:
        head = (
            "I looked before touching the code: the problem is not the agent "
            "itself, it is its configuration."
        )
        tail = (
            "Nothing in the code was changed. Fix the point above, try again, "
            "and tell me if it persists — then I will look at the code."
        )
    bullets = "\n".join(f"- {line}" for line in result.findings)
    return f"{head}\n\n{bullets}\n\n{tail}"
