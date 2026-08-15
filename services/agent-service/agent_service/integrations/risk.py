"""Deterministic risk classification helpers from tool metadata."""

from __future__ import annotations

from typing import Any

# Keywords that push risk upward (order matters for first match of high).
_HIGH_KEYWORDS = frozenset(
    {
        "send",
        "delete",
        "remove",
        "destroy",
        "transfer",
        "payment",
        "charge",
        "write",
        "post",
        "create",
        "update",
        "mutate",
        "execute",
        "invoke",
        "http",
        "webhook",
        "deploy",
    }
)
_MEDIUM_KEYWORDS = frozenset(
    {
        "draft",
        "compose",
        "upload",
        "attach",
        "invite",
        "share",
        "modify",
        "schedule",
        "calendar",
    }
)
_SIDE_EFFECT_HINTS = frozenset(
    {
        "send",
        "delete",
        "create",
        "update",
        "post",
        "write",
        "transfer",
        "charge",
        "deploy",
        "invoke",
        "http",
    }
)


def _haystack(metadata: dict[str, Any], *, name: str = "", summary: str = "") -> set[str]:
    parts: list[str] = [name.lower(), summary.lower()]
    for key in ("keywords", "categories", "tags"):
        value = metadata.get(key)
        if isinstance(value, (list, tuple, set)):
            parts.extend(str(x).lower() for x in value)
        elif isinstance(value, str):
            parts.append(value.lower())
    for key in ("name", "summary", "description", "action"):
        if isinstance(metadata.get(key), str):
            parts.append(str(metadata[key]).lower())
    tokens: set[str] = set()
    for part in parts:
        for tok in part.replace("-", "_").replace("/", " ").split():
            tokens.add(tok.strip(".,:;()[]{}").lower())
    return {t for t in tokens if t}


def classify_risk(
    *,
    name: str = "",
    summary: str = "",
    side_effect: bool | None = None,
    metadata: dict[str, Any] | None = None,
    explicit_risk: str | None = None,
) -> str:
    """Return low|medium|high. Explicit risk wins when already valid."""
    if explicit_risk in {"low", "medium", "high"}:
        return explicit_risk
    meta = metadata or {}
    if isinstance(meta.get("risk"), str) and meta["risk"] in {"low", "medium", "high"}:
        return str(meta["risk"])
    tokens = _haystack(meta, name=name, summary=summary)
    if tokens & _HIGH_KEYWORDS or side_effect is True:
        # Draft-only create is medium unless other high signals.
        if "draft" in tokens and "send" not in tokens and side_effect is not True:
            return "medium"
        if tokens & {"send", "delete", "payment", "charge", "http", "webhook", "transfer"}:
            return "high"
        if side_effect is True:
            return "high"
        return "high"
    if tokens & _MEDIUM_KEYWORDS:
        return "medium"
    return "low"


def infer_side_effect(
    *,
    name: str = "",
    summary: str = "",
    metadata: dict[str, Any] | None = None,
    explicit: bool | None = None,
) -> bool:
    if explicit is not None:
        return bool(explicit)
    meta = metadata or {}
    if isinstance(meta.get("side_effect"), bool):
        return bool(meta["side_effect"])
    tokens = _haystack(meta, name=name, summary=summary)
    return bool(tokens & _SIDE_EFFECT_HINTS)


def approval_mode_for_risk(risk: str, *, side_effect: bool = False) -> str:
    """Runtime approval is opt-in.

    Connecting an account (OAuth / Pipedream) is the user's authorization to act.
    Only an explicit ``always`` binding should pause a live run for Approve/Deny.
    """
    del risk, side_effect
    return "never"


def enrich_tool_risk_fields(
    *,
    name: str,
    summary: str,
    metadata: dict[str, Any] | None = None,
    side_effect: bool | None = None,
    risk: str | None = None,
) -> dict[str, Any]:
    """Compute risk / side_effect / approval_mode consistently."""
    se = infer_side_effect(name=name, summary=summary, metadata=metadata, explicit=side_effect)
    r = classify_risk(
        name=name, summary=summary, side_effect=se, metadata=metadata, explicit_risk=risk
    )
    return {
        "risk": r,
        "side_effect": se,
        "approval_mode": approval_mode_for_risk(r, side_effect=se),
    }
