-- ============================================================================
-- Stack32 — DEV-ONLY SEED
-- ============================================================================
-- This seed is meant for LOCAL DEVELOPMENT ONLY. Never run it in production.
--
-- It requires at least one user in auth.users. On a fresh `supabase start`,
-- create a test user first (Studio > Authentication > Add user, or sign up
-- through the app), then run `supabase db reset` again — or simply re-run
-- this file. If no user exists, the seed skips gracefully with a notice.
--
-- Seeds: one example agent "Sales Research Agent" with a v1 agent_version
-- whose spec is a realistic AgentSpec, marked as the published version.
-- ============================================================================

do $$
declare
  seed_user_id uuid;
  seed_agent_id uuid;
  seed_version_id uuid;
begin
  -- Pick any existing user (dev convenience). Skip if the instance has none.
  select id into seed_user_id from auth.users order by created_at limit 1;

  if seed_user_id is null then
    raise notice 'Seed skipped: no user found in auth.users. Create a test user, then re-run the seed.';
    return;
  end if;

  -- Idempotency guard: do not duplicate the example agent on re-runs.
  if exists (
    select 1 from public.agents
    where user_id = seed_user_id and slug = 'sales-research-agent'
  ) then
    raise notice 'Seed skipped: "Sales Research Agent" already exists for user %.', seed_user_id;
    return;
  end if;

  insert into public.agents (user_id, name, slug, status, icon)
  values (seed_user_id, 'Sales Research Agent', 'sales-research-agent', 'ready', 'search')
  returning id into seed_agent_id;

  insert into public.agent_versions (agent_id, user_id, version_number, spec, test_status, cost_usd)
  values (
    seed_agent_id,
    seed_user_id,
    1,
    '{
      "name": "Sales Research Agent",
      "goal": "Research companies, score leads and draft personalized emails",
      "tools": ["web_search", "knowledge_search", "calculator"],
      "rules": [
        "Never invent missing information.",
        "Clearly identify uncertainty."
      ],
      "output": {
        "format": "markdown",
        "sections": ["Company overview", "Lead score", "Draft email"]
      },
      "starter_prompts": [
        "Research Acme Corp and score them as a lead",
        "Draft a cold outreach email for the CTO of a mid-size fintech",
        "Compare these three prospects and rank them by fit"
      ]
    }'::jsonb,
    'passed',
    0.42
  )
  returning id into seed_version_id;

  -- Point the agent at its v1 as both draft and published version.
  update public.agents
  set draft_version_id = seed_version_id,
      published_version_id = seed_version_id,
      status = 'published'
  where id = seed_agent_id;

  raise notice 'Seed complete: agent % (version %) created for user %.',
    seed_agent_id, seed_version_id, seed_user_id;
end;
$$;
