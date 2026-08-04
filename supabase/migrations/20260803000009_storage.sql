-- Stack32 — Storage buckets & object policies
--
-- Buckets:
--   avatars         (public)  : profile pictures, publicly readable
--   agent-knowledge (private) : files uploaded as agent knowledge sources
--   attachments     (private) : files attached to conversations
--
-- Convention: every object lives under a "{user_id}/..." prefix, enforced by
-- the policies below via (storage.foldername(name))[1] = auth.uid()::text.

insert into storage.buckets (id, name, public)
values
  ('avatars', 'avatars', true),
  ('agent-knowledge', 'agent-knowledge', false),
  ('attachments', 'attachments', false)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- avatars: public read, owner-managed writes under {user_id}/
-- ---------------------------------------------------------------------------
create policy "Avatars are publicly readable"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "Users can upload own avatars"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can update own avatars"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can delete own avatars"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ---------------------------------------------------------------------------
-- agent-knowledge: private, owner-only under {user_id}/
-- ---------------------------------------------------------------------------
create policy "Users can read own knowledge files"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'agent-knowledge'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can upload own knowledge files"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'agent-knowledge'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can update own knowledge files"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'agent-knowledge'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'agent-knowledge'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can delete own knowledge files"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'agent-knowledge'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ---------------------------------------------------------------------------
-- attachments: private, owner-only under {user_id}/
-- ---------------------------------------------------------------------------
create policy "Users can read own attachments"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can upload own attachments"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can update own attachments"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can delete own attachments"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
