-- Stack32 Phase 2 — defense in depth: anonymous users can never write.
-- RLS already denies these operations (all policies target authenticated),
-- but revoking the privileges gives clearer errors and a stricter posture.

revoke insert, update, delete on all tables in schema public from anon;
alter default privileges in schema public
  revoke insert, update, delete on tables from anon;
