-- EXECUTE on the helper used by installation / review RLS policies.
revoke all on function private.can_use_published_agent(uuid) from public, anon;
grant execute on function private.can_use_published_agent(uuid) to authenticated, service_role;
