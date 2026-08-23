"""Turn a failed tool call into a next step the agent can actually take.

A provider error says what went wrong; it rarely says what to do instead. Told
only `Unknown field name: "Auteur"`, an agent invented a catch-all column and
poured the whole ticket into it rather than mapping onto the columns that were
already there. The failure is the right moment to say "look before you write".

Guidance is keyed on the *shape* of the error, never on the app, so it holds
for the whole catalogue.
"""

from __future__ import annotations

import re

#: (matcher, guidance) — first match wins, so order from specific to general.
_RULES: list[tuple[re.Pattern[str], str]] = [
    (
        re.compile(
            r"unknown[_ ]field|no such (column|field|property)|field .* (does not|doesn't) exist"
            r"|invalid[_ ]field|unrecognized (field|column|property)",
            re.I,
        ),
        "The destination has no such field. List the destination's existing fields "
        "first, then map your values onto the names it already has. Only create a "
        "new field when nothing there can hold the value — and never create one "
        "just to avoid mapping.",
    ),
    (
        re.compile(r"required|missing (required )?(field|parameter|argument|property)", re.I),
        "A required argument was missing. Re-read this tool's schema and supply "
        "every required value before calling it again.",
    ),
    (
        re.compile(
            r"\bnot[_ ]found\b|\b404\b|no (record|row|page|card|item) (with|matching)", re.I
        ),
        "That id does not exist. Look the record up and use the id it returns "
        "rather than composing one.",
    ),
    (
        re.compile(r"forbidden|\b403\b|permission|not authori[sz]ed|insufficient scope", re.I),
        "The connected account is not allowed to do this. Do not retry the same "
        "call — report plainly what the account is missing.",
    ),
    (
        re.compile(r"rate[_ ]limit|too many requests|\b429\b", re.I),
        "The provider is rate limiting. Continue with the rest of the work and "
        "come back to this step once, rather than retrying immediately.",
    ),
    (
        re.compile(r"unauthori[sz]ed|\b401\b|token (expired|invalid)|invalid credentials", re.I),
        "The connection is no longer valid. Stop calling this app and say the "
        "account needs reconnecting.",
    ),
    (
        re.compile(r"invalid|malformed|\b400\b|\b422\b|cannot parse|type mismatch", re.I),
        "The provider rejected the shape of an argument. Re-read this tool's "
        "schema and correct the value's type before trying again.",
    ),
]


def guidance_for_tool_error(code: str | None, message: str | None) -> str | None:
    """A next step for this failure, or None when nothing useful can be said."""
    haystack = f"{code or ''} {message or ''}".strip()
    if not haystack:
        return None
    for matcher, advice in _RULES:
        if matcher.search(haystack):
            return advice
    return None


def with_guidance(observation: dict, code: str | None, message: str | None) -> dict:
    """Attach guidance to a failed observation, leaving it untouched otherwise."""
    advice = guidance_for_tool_error(code, message)
    if advice and "guidance" not in observation:
        observation = {**observation, "guidance": advice}
    return observation
