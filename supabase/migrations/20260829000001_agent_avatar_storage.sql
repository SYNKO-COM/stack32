-- Public agent profile images (marketplace / landing showcase).
-- Path layout: {user_id}/{agent_id}/{filename}

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'agent-avatars',
  'agent-avatars',
  true,
  30 * 1024 * 1024,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "agent_avatars_public_read"
  on storage.objects for select
  using (bucket_id = 'agent-avatars');

create policy "agent_avatars_insert_own_folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'agent-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "agent_avatars_update_own_folder"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'agent-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'agent-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "agent_avatars_delete_own_folder"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'agent-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
