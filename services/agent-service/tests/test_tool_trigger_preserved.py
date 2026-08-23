"""An event trigger must survive a rebuild, however the build got interrupted.

The spec is rebuilt from whatever capabilities the current turn is carrying.
A turn resumed from a fresh user message carries none, so the rebuilt spec
dropped the Gmail trigger the user had picked and the agent quietly went back
to chat-only — while its trigger row sat in the database, enabled, listening
for gmail-new-email-received.
"""

from __future__ import annotations

from agent_service.builder.orchestrator import _resolve_spec_triggers
from agent_service.models.agent_spec import TriggerConfig


def spec_with(triggers):
    class _Spec:
        pass

    s = _Spec()
    s.triggers = triggers
    return s


def kinds(triggers):
    return [t.kind for t in triggers]


def test_chat_is_always_present():
    out = _resolve_spec_triggers(current=None, schedule_hourly=False)
    assert kinds(out) == ["chat"]


def test_an_explicit_tool_trigger_is_used():
    out = _resolve_spec_triggers(
        current=None,
        schedule_hourly=False,
        tool_trigger={"app_id": "gmail", "component_id": "gmail-new-email-received"},
    )
    tool = next(t for t in out if t.kind == "tool")
    assert tool.component_id == "gmail-new-email-received"
    assert tool.app_id == "gmail"


def test_a_trigger_already_in_the_spec_is_preserved():
    current = spec_with(
        [
            TriggerConfig(kind="chat", enabled=True),
            TriggerConfig(
                kind="tool",
                enabled=True,
                app_id="gmail",
                component_id="gmail-new-email-received",
            ),
        ]
    )
    out = _resolve_spec_triggers(current=current, schedule_hourly=False)
    assert any(t.kind == "tool" and t.component_id == "gmail-new-email-received" for t in out)


def test_a_recovered_trigger_reaches_the_spec():
    """What configured_tool_trigger() hands back must be honoured like any other."""
    out = _resolve_spec_triggers(
        current=spec_with([TriggerConfig(kind="chat", enabled=True)]),
        schedule_hourly=False,
        tool_trigger={
            "app_id": "gmail",
            "component_id": "gmail-new-email-received",
            "label": "Nouvel e-mail",
        },
    )
    tool = next(t for t in out if t.kind == "tool")
    assert tool.label == "Nouvel e-mail"


def test_a_disabled_trigger_is_not_revived():
    current = spec_with(
        [
            TriggerConfig(kind="chat", enabled=True),
            TriggerConfig(
                kind="tool",
                enabled=False,
                app_id="gmail",
                component_id="gmail-new-email-received",
            ),
        ]
    )
    out = _resolve_spec_triggers(current=current, schedule_hourly=False)
    assert not any(t.kind == "tool" for t in out)


def test_schedule_and_tool_can_coexist():
    out = _resolve_spec_triggers(
        current=None,
        schedule_hourly=True,
        tool_trigger={"app_id": "gmail", "component_id": "gmail-new-email-received"},
    )
    assert set(kinds(out)) == {"chat", "schedule", "tool"}
