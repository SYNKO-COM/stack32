"""A creator's plan carries an audience; a free user's test runs are free.

Starter carries 500 subscribers, Pro 1000, Scale 2000 — total across all the
creator's agents. When the audience is full, the subscribe path refuses with
SUBSCRIBER_LIMIT_REACHED and the public page greys its button on that code.
And a free-plan user, already boxed to ten live messages, pays no credit for
running an agent: the box is the price.
"""

import inspect

import pytest

from agent_service.billing.plans import PLANS


class TestTheAudienceNumbers:
    def test_the_ladder_reads_500_1000_2000(self):
        assert PLANS["starter"].max_subscribers == 500
        assert PLANS["pro"].max_subscribers == 1000
        assert PLANS["scale"].max_subscribers == 2000

    def test_free_cannot_have_subscribers_because_it_cannot_publish(self):
        assert PLANS["free"].max_subscribers == 0
        assert PLANS["free"].can_publish is False


class TestTheGuardSitsOnTheOnlyDoor:
    def test_get_or_create_checks_the_owners_audience(self):
        from agent_service.installations import service

        src = inspect.getsource(service.InstallationService.get_or_create)
        assert "_owner_audience_full" in src
        assert "SUBSCRIBER_LIMIT_REACHED" in src

    def test_owners_are_never_counted_nor_blocked(self):
        from agent_service.installations import service

        src = inspect.getsource(service.InstallationService.get_or_create)
        # The guard only runs for a user other than the owner…
        assert 'owner_id != user_id' in src
        src2 = inspect.getsource(service.InstallationService._owner_audience_full)
        # …and the count excludes the owner's own installations.
        assert 'f"neq.{owner_id}"' in src2

    def test_a_lookup_failure_does_not_lock_subscribers_out(self):
        from agent_service.installations import service

        src = inspect.getsource(service.InstallationService._owner_audience_full)
        assert "return False" in src.split("except Exception")[1]


class TestFreeRunsAreWaived:
    def test_a_free_user_funded_run_bills_zero(self):
        from agent_service.security import llm_budget

        src = inspect.getsource(llm_budget)
        assert 'if budget.plan_key == "free"' in src
        assert "billed_usd = 0.0" in src

    def test_paid_plans_still_pay_their_own_credit_price(self):
        from agent_service.security import llm_budget

        src = inspect.getsource(llm_budget)
        assert "service_cost_usd_per_live_run(" in src
        assert "budget.plan_key" in src

    def test_platform_funded_builds_are_untouched(self):
        # The waiver lives inside the user_funded_llm branch only.
        from agent_service.security import llm_budget

        src = inspect.getsource(llm_budget)
        idx = src.index('if budget.user_funded_llm:')
        assert src.index('if budget.plan_key == "free"') > idx


class TestTheConsumerAbuseCap:
    @pytest.mark.asyncio
    async def test_owners_are_exempt(self):
        from agent_service.security.rate_limit import check_consumer_abuse

        # Same id for user and owner: returns without any lookup or error.
        await check_consumer_abuse(user_id="u1", agent_owner_id="u1")
        await check_consumer_abuse(user_id="u1", agent_owner_id=None)

    def test_the_cap_is_generous(self):
        from agent_service.config import Settings

        assert Settings().RATE_LIMIT_CONSUMER_RUNS_PER_HOUR >= 100

    def test_the_live_route_applies_it(self):
        from agent_service.routers import live

        src = inspect.getsource(live)
        assert "check_consumer_abuse" in src
