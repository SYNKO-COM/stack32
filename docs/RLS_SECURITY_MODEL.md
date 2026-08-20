# RLS & Security Model (Phase 2)

Posture: **deny by default**. RLS is enabled on every table; policies are separate per operation and target the `authenticated` role only. `anon` has zero row access and all write privileges revoked (`20260804000015_anon_lockdown.sql`). The service role bypasses RLS and is used exclusively by trusted server code (Next.js server actions / agent-service) after explicit ownership verification.

## Access matrix (authenticated users, own data only)

| Table | SELECT | INSERT | UPDATE | DELETE |
| --- | --- | --- | --- | --- |
| `profiles` | own | — (trigger) | own, safe columns only¹ | — (auth cascade) |
| `onboarding_responses` | own | — (RPC only) | — (RPC only) | — |
| `subscriptions` | own | — | — | — |
| `agents` | own, not deleted | own² | own, safe columns³ | — (soft delete) |
| `agent_versions` | owned agent | owned agent + self as author | — (immutable) | — |
| `builder_threads` | own | own | own | — |
| `builder_messages` | own thread | **role `user` only**, own thread | — | — |
| `live_threads` | own | own | own | own (clear chat) |
| `live_messages` | own thread | **role `user` only**, own thread | — | — |
| `runs` / `run_events` | own | — | — | — |
| `tool_catalog` | enabled & not internal | — | — | — |
| `agent_tool_bindings` | owned agent | owned agent | owned agent | owned agent |
| `knowledge_sources` | own + owned agent | own + owned agent | own | own |
| `knowledge_chunks` | own + owned agent | — | — | — |
| `agent_tests` | owned agent | — | — | — |
| `attachments` | own | own, all referenced contexts owned | — | own |
| `artifacts` | own + owned agent | — | — | — |
| `usage_events` | own | — | — | — |
| `webhook_events` | — | — | — | — |

¹ Column-level grants: users can update `first_name, full_name, avatar_url, phone, locale, timezone` — **not** `onboarding_completed*` (set only by the `complete_onboarding` RPC).
² Column-level insert grant excludes nothing dangerous; `user_id` must equal `auth.uid()` (policy).
³ Users cannot change `user_id` (no update grant on that column). Soft delete = setting `deleted_at` (or the `soft_delete_agent` RPC).

## Non-negotiable invariants (all covered by pgTAP)

- A user can never read or write another user's rows, even with known UUIDs.
- A user can never insert `assistant` / `system` / `tool` messages — mock AI responses are written only by trusted server code.
- A user can never forge `runs`, `run_events`, `usage_events` or subscription state.
- Anonymous users see nothing and cannot write anywhere.
- Soft-deleted agents disappear from every client query (and their child rows become unreachable through `private.owns_agent`).

## Helpers

Ownership checks used inside policies live in the `private` schema (`private.owns_agent(uuid)` etc.), are `SECURITY DEFINER` with `search_path = ''`, and are not exposed through the API (`EXECUTE` revoked from `public`/`anon`). This avoids recursive RLS evaluation and keeps policy definitions readable.

## Storage

| Bucket | Visibility | Write scope | Path convention |
| --- | --- | --- | --- |
| `avatars` | Public read⁴ | Owner folder | `{user_id}/avatar/{filename}` |
| `agent-knowledge` | Private | Owner folder | `{user_id}/{agent_id}/{source_id}/{filename}` |
| `attachments` | Private; **8 MiB** + MIME allowlist (images/pdf/text) | Owner folder | `{user_id}/{agent_id}/{thread_id}/{attachment_id}/{filename}` |

⁴ Documented decision: the UI renders avatar URLs directly, so `avatars` is public-read; uploads/updates/deletes remain restricted to the owner's `{user_id}/` folder. Switch to signed URLs later if avatars become sensitive.

All storage policies verify `(storage.foldername(name))[1] = auth.uid()::text`. Creating a bucket grants nothing by itself. Direct SQL deletes on `storage.objects` are additionally blocked by Supabase's `protect_delete` trigger; deletions go through the Storage API where RLS applies.

## Server-side trust boundaries

- The **service-role key** exists only in `apps/web/.env.local` (server-only module guarded by `server-only`) and `services/agent-service/.env`.
- Every server action verifies the caller with `supabase.auth.getUser()` and re-checks agent ownership through an RLS-scoped read **before** any admin write.
- The agent-service verifies Supabase JWTs (JWKS preferred, HS256 legacy fallback) and refuses to boot in production without verification configured. Its data layer always filters by the verified `user_id`.
- Webhooks: events are persisted idempotently but marked `skipped` and never processed until signature verification exists (Phase 7) — unverified payloads can never grant access.
