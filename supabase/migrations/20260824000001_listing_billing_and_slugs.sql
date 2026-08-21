-- Marketplace billing interval + fix untitled public slugs.
-- Forward-only.

alter table public.agents
  add column if not exists listing_billing_interval text not null default 'one_time'
    check (listing_billing_interval in ('one_time', 'weekly', 'monthly', 'yearly'));

comment on column public.agents.listing_billing_interval is
  'Marketplace price cadence: one_time | weekly | monthly | yearly.';

grant update (
  listing_visibility,
  listing_tagline,
  listing_price_cents,
  listing_currency,
  listing_billing_interval,
  slug
) on public.agents to authenticated;

-- Prefer a human slug from the agent name when still on untitled-agent*.
do $$
declare
  r record;
  base text;
  candidate text;
  suffix int;
begin
  for r in
    select id, user_id, name, slug
    from public.agents
    where deleted_at is null
      and slug ~ '^untitled-agent(-[0-9]+)?$'
  loop
    base := private.slugify(coalesce(nullif(trim(r.name), ''), 'agent'));
    if base is null or base = '' then
      base := 'agent';
    end if;
    candidate := base;
    suffix := 2;
    while exists (
      select 1
      from public.agents a
      where a.user_id = r.user_id
        and a.deleted_at is null
        and a.id <> r.id
        and a.slug = candidate
    ) loop
      candidate := base || '-' || suffix;
      suffix := suffix + 1;
    end loop;
    update public.agents set slug = candidate where id = r.id;
  end loop;
end $$;
