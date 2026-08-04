-- Stack32 Phase 2 — Realtime preparation.
-- Only the tables the frontend actually subscribes to. RLS keeps applying to
-- Realtime reads (postgres_changes respects row security).

alter publication supabase_realtime add table public.agents;
alter publication supabase_realtime add table public.builder_messages;
alter publication supabase_realtime add table public.live_messages;
alter publication supabase_realtime add table public.runs;
alter publication supabase_realtime add table public.run_events;
alter publication supabase_realtime add table public.knowledge_sources;
