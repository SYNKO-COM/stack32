-- Stack32 — Extensions & shared helpers
-- Enables required Postgres extensions and defines the reusable
-- set_updated_at() trigger function used by all mutable tables.

-- gen_random_uuid() lives in pgcrypto (also available in core pg13+,
-- but we enable the extension explicitly for portability).
create extension if not exists pgcrypto;

-- pgvector for knowledge embeddings (dimension 1536, see knowledge_chunks).
create extension if not exists vector;

-- Reusable trigger function: keeps updated_at in sync on every UPDATE.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
