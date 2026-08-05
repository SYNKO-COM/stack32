-- pgTAP: M2 ownership-aware vector RPC signatures + conversation_summaries

begin;
select plan(6);

select has_table('public', 'conversation_summaries', 'conversation_summaries exists');

select has_column('public', 'knowledge_sources', 'storage_path', 'knowledge_sources.storage_path');
select has_column('public', 'knowledge_sources', 'extraction_status', 'knowledge_sources.extraction_status');

-- New overloads take p_user_id
select has_function(
  'public',
  'match_knowledge_chunks',
  array['uuid', 'uuid', 'extensions.vector', 'integer', 'double precision'],
  'match_knowledge_chunks(user, agent, embedding, count, min)'
);

select has_function(
  'public',
  'match_agent_memories',
  array['uuid', 'uuid', 'extensions.vector', 'integer', 'double precision'],
  'match_agent_memories(user, agent, embedding, count, min)'
);

select is(
  (select relrowsecurity from pg_class where relname = 'conversation_summaries'),
  true,
  'conversation_summaries has RLS'
);

select * from finish();
rollback;
