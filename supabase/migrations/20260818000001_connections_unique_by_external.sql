-- Allow one Pipedream connected account per external id (per user),
-- not one row per email. Same Google email can back Calendar + Gmail + Docs
-- as separate Pipedream accounts without overwriting each other.
alter table public.user_connections
  drop constraint if exists user_connections_user_id_provider_account_email_key;

drop index if exists user_connections_user_id_provider_account_email_key;

create unique index if not exists user_connections_user_provider_external_uidx
  on public.user_connections (user_id, provider, external_account_id)
  where external_account_id is not null;

comment on index public.user_connections_user_provider_external_uidx is
  'Pipedream/native OAuth accounts are unique by external account id, not email — multiple apps may share an email.';
