"""Free credits are a one-time grant, not a monthly allowance.

The entitlements RPC opened the free period at date_trunc('month', now()),
so every 1st of the month a free account silently received fresh credits —
an unlimited free tier by the calendar. Free is meant to be "10 credits to
build and try one agent, ever, until you subscribe".
"""

from agent_service.billing.plans import PLANS


class TestThePlanCatalogueSaysIt:
    def test_free_credits_do_not_renew(self):
        assert PLANS["free"].credits_renew is False

    def test_every_paid_plan_renews(self):
        for key in ("starter", "pro", "scale"):
            assert PLANS[key].credits_renew is True, key

    def test_the_free_grant_is_ten(self):
        assert PLANS["free"].base_credits == 10
        assert abs(PLANS["free"].base_budget_usd - 0.55) < 0.001


class TestTheMigrationCarriesTheRule:
    def _sql(self) -> str:
        import pathlib

        root = pathlib.Path(__file__).resolve().parents[3]
        # The newest migration is the live definition; guard that one.
        path = root / "supabase/migrations/20260907000001_free_grant_is_ten_credits.sql"
        return path.read_text()

    def test_the_free_window_opens_at_account_creation(self):
        sql = self._sql()
        assert "p.created_at into v_account_created" in sql
        assert "v_start := coalesce(v_account_created" in sql

    def test_the_free_window_never_closes(self):
        # A null end is what makes usage accumulate for the life of the account.
        sql = self._sql()
        free_branch = sql.split("v_plan := 'free';")[1].split("end if;")[0]
        assert "v_end := null;" in free_branch

    def test_paid_plans_keep_a_bounded_billing_period(self):
        sql = self._sql()
        paid_branch = sql.split("v_plan := sub.plan_key;")[1].split("else")[0]
        assert "sub.current_period_end" in paid_branch
        assert "interval '1 month'" in paid_branch or "interval '1 year'" in paid_branch
