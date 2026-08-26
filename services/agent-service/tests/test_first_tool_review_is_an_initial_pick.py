"""The first tool review is an initial pick, not a change review.

The form was chosen by "does a spec exist" — but the identity step writes a
skeleton spec before any tool is chosen, so a brand-new agent's very first
review opened the change-review form ("your current tools stay in place")
with nothing current in it. A review is a CHANGE only when there are current
tools to preserve.
"""

from __future__ import annotations

import pathlib

SOURCE = (
    pathlib.Path(__file__).resolve().parents[1]
    / "agent_service/builder/orchestrator.py"
).read_text()


class TestTheModeFollowsCurrentTools:
    def test_a_bare_spec_no_longer_forces_the_change_form(self):
        assert 'mode = "initial" if current_spec is None else "modify"' not in SOURCE

    def test_current_tools_decide_the_mode(self):
        assert "has_current_tools = bool(current_spec and (current_spec.tools or []))" in SOURCE
        assert 'mode = "modify" if has_current_tools else "initial"' in SOURCE

    def test_the_form_type_still_matches_the_mode(self):
        assert (
            'form_type = "tool_change_review_form" if mode == "modify" else "tool_review_form"'
            in SOURCE
        )
