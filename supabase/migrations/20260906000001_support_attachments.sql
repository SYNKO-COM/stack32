-- Support chat: photos, files and voice messages, both directions.
--
-- A message now carries either text, an attachment, or both. Files live in a
-- private bucket laid out {user_id}/{conversation_id}/{uuid}.{ext} so the
-- owner-folder policies mirror agent-avatars; the admin console reads and
-- writes through the service role and needs no policy.

alter table public.support_messages
  alter column body drop not null;

alter table public.support_messages
  drop constraint if exists support_messages_body_check;

alter table public.support_messages
  add column attachment_path text,
  add column attachment_mime text
    check (attachment_mime is null or char_length(attachment_mime) <= 120),
  add column attachment_name text
    check (attachment_name is null or char_length(attachment_name) <= 200),
  add column attachment_size integer
    check (attachment_size is null or attachment_size between 0 and 26214400);

-- Either words or a file — an empty message stays impossible.
alter table public.support_messages
  add constraint support_messages_content_check check (
    (body is not null and char_length(body) between 1 and 8000)
    or attachment_path is not null
  );

-- The conversation preview must survive a body-less message.
create or replace function private.support_message_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.support_conversations c
  set
    last_message_at = new.created_at,
    last_message_preview = left(
      coalesce(
        new.body,
        case
          when new.attachment_mime like 'audio/%' then 'Message audio'
          when new.attachment_mime like 'image/%' then 'Photo'
          else coalesce(new.attachment_name, 'Fichier')
        end
      ),
      140
    ),
    last_message_sender = new.sender,
    user_unread_count = case
      when new.sender = 'admin' then c.user_unread_count + 1
      else c.user_unread_count
    end,
    admin_unread_count = case
      when new.sender = 'user' then c.admin_unread_count + 1
      else c.admin_unread_count
    end,
    status = case
      when new.sender = 'user' and c.status in ('resolved', 'closed')
        then 'open'
      when new.sender = 'admin' and c.status = 'open'
        then 'pending'
      else c.status
    end
  where c.id = new.conversation_id;
  return new;
end;
$$;

-- Private bucket; 25 MB per file; any type (photos, documents, voice notes).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('support-attachments', 'support-attachments', false, 25 * 1024 * 1024, null)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "support_attachments_insert_own_folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'support-attachments'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "support_attachments_read_own_folder"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'support-attachments'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
