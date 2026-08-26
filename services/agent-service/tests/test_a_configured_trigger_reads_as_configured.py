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
