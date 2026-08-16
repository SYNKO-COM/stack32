-- Billing suspension + period budget assert (RLS / entitlement boundaries).

begin;
select plan(6);

select has_column('public', 'agents', 'pre_suspension_status', 'pre_suspension_status column exists');
select has_function('public', 'assert_period_budget_available', array['uuid']);
select has_function('public', 'suspend_agents_for_billing', array['uuid']);
select has_function('public', 'restore_agents_after_billing', array['uuid']);
select has_function('public', 'claim_webhook_event', array['text', 'text']);

-- Status check includes suspended_billing
select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'agents_status_check'
      and pg_get_constraintdef(oid) like '%suspended_billing%'
  ),
  'agents_status_check allows suspended_billing'
);

select * from finish();
rollback;
