-- M4 — align user_secrets.provider allowlist with the Python/UI provider set.
-- The original constraint rejected google/mistral/groq that BYOK actually supports.

alter table public.user_secrets
  drop constraint if exists user_secrets_provider_check;

alter table public.user_secrets
  add constraint user_secrets_provider_check check (
    provider in (
      'openai', 'anthropic', 'google', 'gemini', 'xai',
      'mistral', 'groq', 'openrouter', 'custom'
    )
  );
