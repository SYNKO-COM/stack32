"""Settings stated in the Build chat get saved, not just read back.

The drawer was the only way to fill a tool's settings. A person who typed
"mon email d'expéditeur est support@acme.com" in Build got a rebuilt spec and
an unchanged drawer, and the agent stayed behind "à configurer" — the very
gap the builder exists to close.

A build turn now looks at what the agent's tools still need, asks a small
model whether the message states any of those values, resolves each stated
value against the app's own option list when there is one, and saves through
the same path the drawer uses. When the message was only configuration, the
turn answers directly instead of rebuilding the spec.
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)

#: At most this many settings are described to the extraction model.
MAX_FIELDS_IN_PROMPT = 40

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


@dataclass
class ChatSetting:
    """One setting a bound tool exposes, with what the drawer knows about it."""

    tool_id: str
    app_id: str
    name: str
    label: str
    description: str
    required: bool
    missing: bool
    has_options: bool


@dataclass
class AppliedFromChat:
    """What a turn managed to save, and what still stands in the way."""

    saved: list[tuple[ChatSetting, Any]] = field(default_factory=list)
    unmatched: list[tuple[ChatSetting, str, list[str]]] = field(default_factory=list)
    still_missing: list[ChatSetting] = field(default_factory=list)
    wants_other_changes: bool = True
    ready: bool = False

    @property
    def did_anything(self) -> bool:
        return bool(self.saved)


def _display_label(prop_name: str, label: str, locale: str) -> str:  # noqa: ARG001
    return label or prop_name


async def gather_chat_settings(
    *, user_id: str, agent_id: str, spec: Any, installation_id: str | None = None
) -> list[ChatSetting]:
    """Every static setting the agent's enabled Pipedream tools expose."""
    from agent_service.integrations.pipedream.tool_config import (
        is_static_prop_configured,
        resolve_effective_tool_config,
    )
    from agent_service.integrations.registry import get_provider_registry

    pd = get_provider_registry().get_provider("pipedream")
    if pd is None:
        return []

    out: list[ChatSetting] = []
    for binding in getattr(spec, "tools", None) or []:
        if not getattr(binding, "enabled", True):
            continue
        tool_id = str(getattr(binding, "tool_id", "") or "")
        if not tool_id.startswith("pd:"):
            continue
        try:
            schema = await pd.get_normalized_schema(tool_id)
        except Exception:  # noqa: BLE001
            continue
        statics = [p for p in schema.props if p.kind == "static"]
        if not statics:
            continue
        app_id = schema.app_id or ""
        merged = await resolve_effective_tool_config(
            user_id=user_id,
            agent_id=agent_id,
            tool_id=tool_id,
            binding_config=dict(getattr(binding, "config", None) or {}),
            installation_id=installation_id,
            app_id=app_id,
        )
        for prop in statics:
            raw = prop.raw if isinstance(prop.raw, dict) else {}
            required = raw.get("optional") is not True
            configured = is_static_prop_configured(prop.name, merged or {}, app_id=app_id)
            out.append(
                ChatSetting(
                    tool_id=tool_id,
                    app_id=app_id,
                    name=prop.name,
                    label=str(prop.label or prop.name),
                    description=str(prop.description or "")[:200],
                    required=required,
                    missing=required and not configured,
                    has_options=bool(
                        raw.get("remoteOptions") or raw.get("useQuery") or raw.get("options")
                    ),
                )
            )
    return out


def _extraction_prompt(content: str, settings: list[ChatSetting]) -> list[dict[str, str]]:
    lines = []
    for i, s in enumerate(settings[:MAX_FIELDS_IN_PROMPT]):
        state = "MISSING" if s.missing else "already set"
        lines.append(
            f"{i}. app={s.app_id} field={s.name} label={s.label!r} ({state})"
            + (f" — {s.description}" if s.description else "")
        )
    system = (
        "You map a user's message onto tool settings. Reply with JSON only:\n"
        '{"assignments": [{"index": <int>, "value": "<string>"}], '
        '"wants_other_changes": <bool>}\n'
        "Rules:\n"
        "- An assignment exists ONLY when the message plainly states a value for that "
        "setting (an email address, a name, an id, a quoted title). Never invent, "
        "never guess, never assign a value the message does not contain.\n"
        "- wants_other_changes is true when the message ALSO asks for anything beyond "
        "stating settings (adding tools, changing behaviour, building, testing).\n"
        "- No assignments and nothing else asked → assignments: [] and "
        "wants_other_changes: true."
    )
    user = "Settings:\n" + "\n".join(lines) + "\n\nUser message:\n" + content[:2000]
    return [{"role": "system", "content": system}, {"role": "user", "content": user}]


def _parse_extraction(payload: str) -> tuple[list[tuple[int, str]], bool]:
    try:
        text = payload.strip()
        if text.startswith("```"):
            text = re.sub(r"^```[a-z]*\n?|\n?```$", "", text, flags=re.M)
        data = json.loads(text)
    except ValueError:
        return [], True
    if not isinstance(data, dict):
        return [], True
    raw = data.get("assignments")
    out: list[tuple[int, str]] = []
    if isinstance(raw, list):
        for item in raw:
            if not isinstance(item, dict):
                continue
            idx, value = item.get("index"), item.get("value")
            if isinstance(idx, int) and isinstance(value, str) and value.strip():
                out.append((idx, value.strip()))
    return out, bool(data.get("wants_other_changes", not out))


def match_option(stated: str, options: list[Any]) -> Any | None:
    """The option the stated value names, by value first, then by label."""
    wanted = stated.strip().lower()
    if not wanted:
        return None
    norm: list[tuple[str, str, Any]] = []
    for opt in options or []:
        if isinstance(opt, dict):
            value = opt.get("value")
            label = str(opt.get("label") or opt.get("name") or value or "")
        else:
            value = opt
            label = str(opt)
        if value is None:
            continue
        norm.append((str(value).strip().lower(), label.strip().lower(), value))
    for v, _, value in norm:
        if v == wanted:
            return value
    for _, lbl, value in norm:
        if lbl == wanted:
            return value
    contains = [value for _, lbl, value in norm if wanted in lbl or lbl in wanted]
    if len(contains) == 1:
        return contains[0]
    return None


def _value_shape_ok(setting: ChatSetting, stated: str) -> bool:
    if "email" in setting.name.lower():
        return bool(_EMAIL_RE.match(stated))
    return True


async def apply_settings_from_chat(
    *,
    db: Any,
    gateway: Any,
    user_id: str,
    agent_id: str,
    content: str,
    locale: str = "en",
) -> AppliedFromChat | None:
    """Save every setting the message states. None when there was nothing to try."""
    from agent_service.gateway.model_gateway import ModelProfile

    spec = await db.load_draft_spec(agent_id, user_id)
    if spec is None:
        return None
    settings = await gather_chat_settings(user_id=user_id, agent_id=agent_id, spec=spec)
    if not settings:
        return None
    # Without a gap and without a settings word, this turn is not configuration.
    mentions_config = bool(
        re.search(
            r"\b(config\w*|réglage\w*|reglage\w*|paramèt\w*|paramet\w*|setting\w*|"
            r"exp[ée]diteur|from\s*email|inbox|bo[iî]te)\b",
            content.lower(),
        )
    )
    if not any(s.missing for s in settings) and not mentions_config:
        return None

    try:
        result = await gateway.complete(
            profile=ModelProfile.FAST,
            messages=_extraction_prompt(content, settings),
            temperature=0.0,
            max_tokens=400,
        )
        answer = result.content if hasattr(result, "content") else str(result)
    except Exception:  # noqa: BLE001
        logger.exception("config_from_chat_extraction_failed agent_id=%s", agent_id)
        return None

    assignments, wants_more = _parse_extraction(answer or "")
    outcome = AppliedFromChat(wants_other_changes=wants_more)
    outcome.still_missing = [s for s in settings if s.missing]
    if not assignments:
        return outcome

    from agent_service.integrations.normalize import ToolRef
    from agent_service.integrations.pipedream.accounts import (
        load_agent_tool_config,
        replicate_tool_config_to_app_siblings,
        upsert_agent_tool_config,
    )
    from agent_service.integrations.registry import get_provider_registry

    pd = get_provider_registry().get_provider("pipedream")
    per_tool: dict[str, dict[str, Any]] = {}
    for idx, stated in assignments:
        if not (0 <= idx < len(settings)):
            continue
        setting = settings[idx]
        value: Any | None = None
        if setting.has_options and pd is not None:
            try:
                options = await pd.get_dynamic_options(
                    ToolRef(
                        tool_id=setting.tool_id,
                        provider="pipedream",
                        provider_tool_id=setting.tool_id.removeprefix("pd:"),
                    ),
                    setting.name,
                    context={
                        "user_id": user_id,
                        "config": await load_agent_tool_config(
                            user_id=user_id, agent_id=agent_id, tool_id=setting.tool_id
                        ),
                    },
                )
            except Exception:  # noqa: BLE001
                options = []
            value = match_option(stated, options)
            if value is None and options:
                labels = []
                for opt in options[:6]:
                    labels.append(
                        str(opt.get("label") or opt.get("value"))
                        if isinstance(opt, dict)
                        else str(opt)
                    )
                outcome.unmatched.append((setting, stated, labels))
                continue
        if value is None:
            if not _value_shape_ok(setting, stated):
                outcome.unmatched.append((setting, stated, []))
                continue
            value = stated
        per_tool.setdefault(setting.tool_id, {})[setting.name] = value
        outcome.saved.append((setting, value))

    for tool_id, new_values in per_tool.items():
        existing = await load_agent_tool_config(
            user_id=user_id, agent_id=agent_id, tool_id=tool_id
        )
        merged = {**(existing or {}), **new_values}
        await upsert_agent_tool_config(
            user_id=user_id, agent_id=agent_id, tool_id=tool_id, config=merged
        )
        await replicate_tool_config_to_app_siblings(
            user_id=user_id, agent_id=agent_id, source_tool_id=tool_id, config=merged
        )

    if outcome.saved:
        try:
            from agent_service.readiness.evaluator import evaluate_installation_readiness

            res = await evaluate_installation_readiness(
                agent_id=agent_id, user_id=user_id, spec=spec, db=db
            )
            outcome.ready = res.status == "ready"
            missing_now: set[tuple[str, str]] = set()
            for item in res.missing_config:
                for f in item.get("fields") or []:
                    missing_now.add((str(item.get("tool_id") or ""), str(f)))
            outcome.still_missing = [
                s for s in settings if (s.tool_id, s.name) in missing_now
            ]
        except Exception:  # noqa: BLE001
            logger.exception("config_from_chat_readiness_failed agent_id=%s", agent_id)
    return outcome


def compose_settings_reply(outcome: AppliedFromChat, locale: str) -> str:
    """One short message: what was saved, what still blocks, in the app language."""
    fr = str(locale).lower().startswith("fr")

    def label(s: ChatSetting) -> str:
        return _display_label(s.name, s.label, "fr" if fr else "en")

    def app(s: ChatSetting) -> str:
        return (s.app_id or s.tool_id.removeprefix("pd:").split("-")[0]).replace("_", " ").title()

    lines: list[str] = []
    if outcome.saved:
        parts = [f"{label(s)} ({app(s)})" for s, _ in outcome.saved]
        lines.append(
            ("C'est enregistré : " if fr else "Saved: ") + ", ".join(sorted(set(parts))) + "."
        )
    for setting, stated, options in outcome.unmatched:
        if options:
            lines.append(
                (
                    f"Je n'ai pas trouvé « {stated} » parmi les choix pour "
                    f"{label(setting)} ({app(setting)}). Par exemple : "
                    if fr
                    else f"I could not find “{stated}” among the choices for "
                    f"{label(setting)} ({app(setting)}). For example: "
                )
                + ", ".join(options[:4])
                + "."
            )
        else:
            lines.append(
                f"« {stated} » ne ressemble pas à une valeur valide pour {label(setting)}."
                if fr
                else f"“{stated}” does not look like a valid value for {label(setting)}."
            )
    if outcome.ready:
        lines.append(
            "Tout est configuré — votre agent est prêt." if fr else "Everything is set — your agent is ready."
        )
    elif outcome.still_missing:
        parts = sorted({f"{label(s)} ({app(s)})" for s in outcome.still_missing})
        lines.append(
            ("Il reste à renseigner : " if fr else "Still to fill in: ") + ", ".join(parts) + "."
        )
        lines.append(
            "Dites-moi les valeurs ici, ou ouvrez l'outil dans la structure."
            if fr
            else "Tell me the values here, or open the tool in the structure."
        )
    return "\n".join(lines) if lines else (
        "Rien à enregistrer pour l'instant." if fr else "Nothing to save yet."
    )
