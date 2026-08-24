"""The gauge must never read past its own end.

Free credits accumulate for the life of the account, so a lapsed Pro
subscriber who had spent 150 of 200 credits came back to free and saw
"150 / 25" — a surplus that means nothing. Clamped, it reads "25 / 25":
nothing left, which is true. Someone who had spent only 10 still reads
"10 / 25", which is also true and useful.
"""

import pathlib


def _sql() -> str:
    root = pathlib.Path(__file__).resolve().parents[3]
    return (root / "supabase/migrations/20260903000002_gauge_never_shows_a_surplus.sql").read_text()


class TestOnlyTheDisplayIsClamped:
    def test_the_shown_consumption_is_capped_at_the_allowance(self):
        sql = _sql()
        assert "least(used_credits, ent.period_credits)" in sql
        assert "'usedCredits', round(shown_credits, 2)" in sql

    def test_the_budget_gate_still_reads_the_real_numbers(self):
        # Clamping the bar must not make an exhausted account look spendable.
        sql = _sql()
        assert "'exhausted', used_usd >= ent.budget_usd or used_credits >= ent.period_credits" in sql

    def test_the_dollar_figure_is_never_clamped(self):
        sql = _sql()
        assert "'usedUsd', round(used_usd, 6)" in sql

    def test_remaining_never_goes_negative(self):
        sql = _sql()
        assert "greatest(0, round(ent.period_credits - used_credits, 2))" in sql
