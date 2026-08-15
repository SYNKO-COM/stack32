-- Allow authenticated users to read the published AgentSpec snapshot only.
-- Required for public consumer Agent IA (structure read-only) without leaking drafts.

create policy "agent_versions_select_published_agent"
  on public.agent_versions for select
  to authenticated
  using (
    exists (
      select 1
      from public.agents a
      where a.id = agent_versions.agent_id
        and a.status = 'published'
        and a.deleted_at is null
        and a.published_version_id = agent_versions.id
    )
  );

comment on policy "agent_versions_select_published_agent" on public.agent_versions is
  'Consumers may read the active published version of a published agent (no drafts).';
