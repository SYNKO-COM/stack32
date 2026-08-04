-- Stack32 Phase 2 — Storage buckets and policies.
--
-- Buckets:
--   avatars          public read; users write only under {user_id}/...
--   agent-knowledge  private; owner-only under {user_id}/{agent_id}/{source_id}/...
--   attachments      private; owner-only under {user_id}/{agent_id}/{thread_id}/...
--
-- Privacy decision: avatars is PUBLIC-read because the current UI renders
-- avatar URLs directly (no signed-URL plumbing). Documented in docs/STORAGE.md.
-- Creating a bucket does NOT grant upload access: policies below do.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', true, 5 * 1024 * 1024,
   array['image/png', 'image/jpeg', 'image/webp', 'image/gif']),
  ('agent-knowledge', 'agent-knowledge', false, 25 * 1024 * 1024,
   array['application/pdf', 'text/plain', 'text/markdown', 'text/csv', 'application/json']),
  ('attachments', 'attachments', false, 25 * 1024 * 1024, null)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- avatars — {user_id}/avatar/{filename}
-- ---------------------------------------------------------------------------
create policy "avatars_public_read"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "avatars_insert_own_folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "avatars_update_own_folder"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "avatars_delete_own_folder"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- ---------------------------------------------------------------------------
-- agent-knowledge — {user_id}/{agent_id}/{source_id}/{filename}
-- ---------------------------------------------------------------------------
create policy "knowledge_read_own_folder"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'agent-knowledge'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "knowledge_insert_own_folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'agent-knowledge'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "knowledge_update_own_folder"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'agent-knowledge'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'agent-knowledge'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "knowledge_delete_own_folder"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'agent-knowledge'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- ---------------------------------------------------------------------------
-- attachments — {user_id}/{agent_id}/{thread_id}/{attachment_id}/{filename}
-- ---------------------------------------------------------------------------
create policy "attachments_read_own_folder"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "attachments_insert_own_folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "attachments_update_own_folder"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "attachments_delete_own_folder"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
