"""A saved trigger's settings must be read where they actually live.

``configured_tool_trigger`` returns ``extra_props`` at the top level of its
row. The readiness check read ``row["config"]["extra_props"]`` — a key that
row never carries — so a Discord trigger with its channel filled and saved
was judged empty forever: the banner kept saying "choisissez channels" no
matter how many times the person saved or refreshed.
"""

from __future__ import annotations

import pathlib

EVALUATOR = (
    pathlib.Path(__file__).resolve().parents[1]
    / "agent_service/readiness/evaluator.py"
).read_text()


class TestTheEvaluatorReadsTheRealRow:
    def test_top_level_extra_props_are_read(self):
        assert 'trigger_row.get("extra_props")' in EVALUATOR

    def test_the_config_shape_still_works_as_fallback(self):
        assert 'cfg.get("extra_props")' in EVALUATOR

    def test_non_dict_extras_are_passed_as_none(self):
        assert "extra_props=extra if isinstance(extra, dict) else None" in EVALUATOR


class TestTheTriggerHelperReadsWhereTheTableWrites:
    """``configured_tool_trigger`` itself must surface config.extra_props.

    The Structure save path writes the settings under ``config.extra_props``;
    the helper used to return a top-level ``extra_props`` the row never has,
    so every caller — readiness, spec rebuilds — saw an empty trigger.
    """

    @staticmethod
    def _wire(monkeypatch, row):
        from contextlib import asynccontextmanager

        @asynccontextmanager
        async def fake_admin_client():
            yield object()

        async def fake_rows(client, *, user_id, agent_id):
            return [row]

        monkeypatch.setattr(
            "agent_service.supabase_client.get_supabase_admin_client",
            fake_admin_client,
        )
        monkeypatch.setattr(
            "agent_service.triggers.service._list_agent_tool_rows", fake_rows
        )

    def test_settings_under_config_extra_props_are_surfaced(self, monkeypatch):
        import asyncio

        from agent_service.triggers.service import configured_tool_trigger

        self._wire(
            monkeypatch,
            {
                "app_id": "discord",
                "component_id": "discord-new-message",
                "enabled": True,
                "config": {"extra_props": {"channels": "1541"}},
            },
        )
        found = asyncio.run(
            configured_tool_trigger(user_id="u", agent_id="a")
        )
        assert found is not None
        assert found["extra_props"] == {"channels": "1541"}

    def test_a_legacy_top_level_shape_still_wins(self, monkeypatch):
        import asyncio

        from agent_service.triggers.service import configured_tool_trigger

        self._wire(
            monkeypatch,
            {
                "app_id": "discord",
                "component_id": "discord-new-message",
                "enabled": True,
                "extra_props": {"channels": "top"},
                "config": {"extra_props": {"channels": "nested"}},
            },
        )
        found = asyncio.run(
            configured_tool_trigger(user_id="u", agent_id="a")
        )
        assert found is not None
        assert found["extra_props"] == {"channels": "top"}
