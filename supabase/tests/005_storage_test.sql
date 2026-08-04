-- Storage buckets and object path isolation.
begin;
create extension if not exists pgtap with schema extensions;

select plan(8);

select is(
  (select count(*)::int from storage.buckets
   where id in ('avatars', 'agent-knowledge', 'attachments')),
  3, 'all three buckets exist'
);
select is(
  (select public from storage.buckets where id = 'avatars'),
  true, 'avatars bucket is public-read'
);
select is(
  (select public from storage.buckets where id = 'agent-knowledge'),
  false, 'agent-knowledge bucket is private'
);
select is(
  (select public from storage.buckets where id = 'attachments'),
  false, 'attachments bucket is private'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', 'cccccccc-cccc-cccc-cccc-cccccccccccc',
   'authenticated', 'authenticated', 'storage-a@stack32.test',
   extensions.crypt('password123', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'dddddddd-dddd-dddd-dddd-dddddddddddd',
   'authenticated', 'authenticated', 'storage-b@stack32.test',
   extensions.crypt('password123', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now());

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}', true);

-- User C can create an object under their own folder.
select lives_ok(
  $$insert into storage.objects (bucket_id, name, owner_id)
    values ('agent-knowledge',
            'cccccccc-cccc-cccc-cccc-cccccccccccc/agent1/src1/doc.pdf',
            'cccccccc-cccc-cccc-cccc-cccccccccccc')$$,
  'user can upload into own knowledge folder'
);

-- ...but not under someone else's folder.
select throws_like(
  $$insert into storage.objects (bucket_id, name, owner_id)
    values ('agent-knowledge',
            'dddddddd-dddd-dddd-dddd-dddddddddddd/agent1/src1/doc.pdf',
            'cccccccc-cccc-cccc-cccc-cccccccccccc')$$,
  '%row-level security%',
  'user cannot upload into another user folder'
);

-- User D cannot read user C's private objects.
select set_config('request.jwt.claims',
  '{"sub":"dddddddd-dddd-dddd-dddd-dddddddddddd","role":"authenticated"}', true);
select is(
  (select count(*)::int from storage.objects
   where bucket_id = 'agent-knowledge'),
  0, 'other user cannot list private knowledge objects'
);
-- Direct SQL deletes on storage.objects are blocked by storage.protect_delete;
-- real deletions go through the Storage API, where the RLS delete policies
-- (owner folder only) apply.
select throws_like(
  $$delete from storage.objects
    where bucket_id = 'agent-knowledge' and name like 'cccccccc%'$$,
  '%not allowed%',
  'direct SQL deletes on storage.objects are blocked'
);

select * from finish();
rollback;
