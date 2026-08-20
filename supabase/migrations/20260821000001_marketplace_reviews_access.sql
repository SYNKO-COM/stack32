-- Marketplace listing, access requests, views, and reviews for published agents.
-- Forward-only.

-- ---------------------------------------------------------------------------
-- agents: listing fields (owner-editable)
-- ---------------------------------------------------------------------------
alter table public.agents
  add column if not exists listing_visibility text not null default 'private'
    check (listing_visibility in ('private', 'public')),
  add column if not exists listing_tagline text,
  add column if not exists listing_price_cents integer not null default 0
    check (listing_price_cents >= 0),
  add column if not exists listing_currency text not null default 'eur';

comment on column public.agents.listing_visibility is
  'public = listed in marketplace; private = link-only, requires approved access.';

update public.agents
set listing_visibility = 'public'
where status = 'published'
  and deleted_at is null
  and listing_visibility = 'private';

grant update (
  listing_visibility,
  listing_tagline,
  listing_price_cents,
  listing_currency
) on public.agents to authenticated;

-- ---------------------------------------------------------------------------
-- agent_access_requests
-- ---------------------------------------------------------------------------
create table if not exists public.agent_access_requests (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents (id) on delete cascade,
  requester_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'denied')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (agent_id, requester_id)
);

create index if not exists agent_access_requests_agent_idx
  on public.agent_access_requests (agent_id, status);
create index if not exists agent_access_requests_requester_idx
  on public.agent_access_requests (requester_id);

alter table public.agent_access_requests enable row level security;

create policy agent_access_requests_select
  on public.agent_access_requests for select
  to authenticated
  using (
    requester_id = (select auth.uid())
    or private.owns_agent(agent_id)
  );

create policy agent_access_requests_insert_own
  on public.agent_access_requests for insert
  to authenticated
  with check (
    requester_id = (select auth.uid())
    and not private.owns_agent(agent_id)
    and exists (
      select 1 from public.agents a
      where a.id = agent_id
        and a.status = 'published'
        and a.deleted_at is null
    )
  );

create policy agent_access_requests_update_owner
  on public.agent_access_requests for update
  to authenticated
  using (private.owns_agent(agent_id))
  with check (private.owns_agent(agent_id));

revoke delete on public.agent_access_requests from authenticated, anon;
grant select, insert, update on public.agent_access_requests to authenticated;
grant all on public.agent_access_requests to service_role;

-- Recreate helper now that the table exists (first definition referenced it).
create or replace function private.can_use_published_agent(agent_uuid uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.agents a
    where a.id = agent_uuid
      and a.deleted_at is null
      and a.status = 'published'
      and (
        a.user_id = (select auth.uid())
        or a.listing_visibility = 'public'
        or exists (
          select 1
          from public.agent_access_requests r
          where r.agent_id = a.id
            and r.requester_id = (select auth.uid())
            and r.status = 'approved'
        )
      )
  );
$$;

revoke all on function private.can_use_published_agent(uuid) from public, anon;
grant execute on function private.can_use_published_agent(uuid) to authenticated, service_role;

drop policy if exists agent_installations_insert_own on public.agent_installations;
create policy agent_installations_insert_own on public.agent_installations
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and (
      private.owns_agent(agent_id)
      or private.can_use_published_agent(agent_id)
    )
  );

-- ---------------------------------------------------------------------------
-- agent_listing_views (clicks / impressions)
-- ---------------------------------------------------------------------------
create table if not exists public.agent_listing_views (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents (id) on delete cascade,
  viewer_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists agent_listing_views_agent_created_idx
  on public.agent_listing_views (agent_id, created_at desc);

alter table public.agent_listing_views enable row level security;

create policy agent_listing_views_insert_self
  on public.agent_listing_views for insert
  to authenticated
  with check (
    viewer_id is null or viewer_id = (select auth.uid())
  );

create policy agent_listing_views_select_owner
  on public.agent_listing_views for select
  to authenticated
  using (private.owns_agent(agent_id));

revoke update, delete on public.agent_listing_views from authenticated, anon;
grant select, insert on public.agent_listing_views to authenticated;
grant all on public.agent_listing_views to service_role;

-- ---------------------------------------------------------------------------
-- agent_listing_purchases (paid subscribers — filled when billing lands)
-- ---------------------------------------------------------------------------
create table if not exists public.agent_listing_purchases (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents (id) on delete cascade,
  buyer_id uuid not null references auth.users (id) on delete cascade,
  amount_cents integer not null check (amount_cents >= 0),
  currency text not null default 'eur',
  created_at timestamptz not null default now(),
  unique (agent_id, buyer_id)
);

create index if not exists agent_listing_purchases_agent_idx
  on public.agent_listing_purchases (agent_id);

alter table public.agent_listing_purchases enable row level security;

create policy agent_listing_purchases_select
  on public.agent_listing_purchases for select
  to authenticated
  using (
    buyer_id = (select auth.uid())
    or private.owns_agent(agent_id)
  );

revoke insert, update, delete on public.agent_listing_purchases from authenticated, anon;
grant select on public.agent_listing_purchases to authenticated;
grant all on public.agent_listing_purchases to service_role;

-- ---------------------------------------------------------------------------
-- agent_reviews
-- ---------------------------------------------------------------------------
create table if not exists public.agent_reviews (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  rating integer not null check (rating >= 1 and rating <= 5),
  body text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agent_id, user_id)
);

create index if not exists agent_reviews_agent_idx on public.agent_reviews (agent_id);
create trigger set_agent_reviews_updated_at
  before update on public.agent_reviews
  for each row execute function public.set_updated_at();

alter table public.agent_reviews enable row level security;

create policy agent_reviews_select
  on public.agent_reviews for select
  to authenticated
  using (
    private.owns_agent(agent_id)
    or user_id = (select auth.uid())
    or exists (
      select 1 from public.agents a
      where a.id = agent_id
        and a.status = 'published'
        and a.deleted_at is null
        and a.listing_visibility = 'public'
    )
  );

create policy agent_reviews_insert_own
  on public.agent_reviews for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and not private.owns_agent(agent_id)
    and (
      exists (
        select 1 from public.agent_installations i
        where i.agent_id = agent_reviews.agent_id
          and i.user_id = (select auth.uid())
      )
      or private.can_use_published_agent(agent_id)
    )
  );

create policy agent_reviews_update_own
  on public.agent_reviews for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy agent_reviews_delete_own
  on public.agent_reviews for delete
  to authenticated
  using (user_id = (select auth.uid()));

grant select, insert, update, delete on public.agent_reviews to authenticated;
grant all on public.agent_reviews to service_role;

-- ---------------------------------------------------------------------------
-- Marketplace catalog (random order) — security definer, public metadata only
-- ---------------------------------------------------------------------------
create or replace function public.list_marketplace_agents()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_out jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select coalesce(jsonb_agg(row_to_json(x)), '[]'::jsonb)
  into v_out
  from (
    select
      a.id as "agentId",
      a.name,
      a.slug,
      a.description,
      a.icon_key as "iconKey",
      a.listing_tagline as "tagline",
      a.listing_price_cents as "priceCents",
      a.listing_currency as "currency",
      p.username as "creatorUsername",
      p.id as "creatorUserId",
      coalesce(stats.avg_rating, 0)::numeric as "avgRating",
      coalesce(stats.review_count, 0)::int as "reviewCount"
    from public.agents a
    join public.profiles p on p.id = a.user_id
    left join (
      select
        r.agent_id,
        avg(r.rating)::numeric as avg_rating,
        count(*)::int as review_count
      from public.agent_reviews r
      group by r.agent_id
    ) stats on stats.agent_id = a.id
    where a.deleted_at is null
      and a.status = 'published'
      and a.listing_visibility = 'public'
      and p.username is not null
    order by random()
  ) x;

  return v_out;
end;
$$;

revoke all on function public.list_marketplace_agents() from public;
grant execute on function public.list_marketplace_agents() to authenticated, service_role;

-- Owner dashboard: subscriber names without exposing other profiles via RLS.
create or replace function public.list_agent_audience(p_agent_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_out jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not private.owns_agent(p_agent_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'subscribers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'userId', i.user_id,
        'name', coalesce(nullif(pr.full_name, ''), nullif(pr.first_name, ''), pr.username, 'User'),
        'username', pr.username
      ))
      from public.agent_installations i
      left join public.profiles pr on pr.id = i.user_id
      where i.agent_id = p_agent_id
        and i.user_id <> (select auth.uid())
    ), '[]'::jsonb),
    'buyers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'userId', b.buyer_id,
        'name', coalesce(nullif(pr.full_name, ''), nullif(pr.first_name, ''), pr.username, 'User'),
        'username', pr.username,
        'amountCents', b.amount_cents
      ))
      from public.agent_listing_purchases b
      left join public.profiles pr on pr.id = b.buyer_id
      where b.agent_id = p_agent_id
    ), '[]'::jsonb)
  ) into v_out;

  return v_out;
end;
$$;

revoke all on function public.list_agent_audience(uuid) from public;
grant execute on function public.list_agent_audience(uuid) to authenticated, service_role;

create or replace function public.list_agent_access_requests(p_agent_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_out jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not private.owns_agent(p_agent_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id,
    'requesterId', r.requester_id,
    'requesterName', coalesce(nullif(pr.full_name, ''), nullif(pr.first_name, ''), pr.username, 'User'),
    'status', r.status,
    'createdAt', r.created_at
  ) order by r.created_at desc), '[]'::jsonb)
  into v_out
  from public.agent_access_requests r
  left join public.profiles pr on pr.id = r.requester_id
  where r.agent_id = p_agent_id;

  return v_out;
end;
$$;

revoke all on function public.list_agent_access_requests(uuid) from public;
grant execute on function public.list_agent_access_requests(uuid) to authenticated, service_role;

create or replace function public.list_agent_reviews(p_agent_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_out jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not (
    private.owns_agent(p_agent_id)
    or private.can_use_published_agent(p_agent_id)
  ) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id,
    'userId', r.user_id,
    'authorName', coalesce(nullif(pr.full_name, ''), nullif(pr.first_name, ''), pr.username, 'User'),
    'rating', r.rating,
    'body', r.body,
    'createdAt', r.created_at,
    'isMine', r.user_id = (select auth.uid())
  ) order by r.created_at desc), '[]'::jsonb)
  into v_out
  from public.agent_reviews r
  left join public.profiles pr on pr.id = r.user_id
  where r.agent_id = p_agent_id;

  return v_out;
end;
$$;

revoke all on function public.list_agent_reviews(uuid) from public;
grant execute on function public.list_agent_reviews(uuid) to authenticated, service_role;
