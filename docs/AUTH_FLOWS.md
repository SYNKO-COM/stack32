# Authentication Flows (Phase 2)

Supabase Auth with SSR cookies (`@supabase/ssr`). Sessions are refreshed by `apps/web/middleware.ts` → `lib/supabase/middleware.ts` on every request; protected routes are enforced server-side (no flash of private content).

## Route protection

| Routes | Access |
| --- | --- |
| `/`, marketing pages, `/legal/*`, `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/auth/*` | Public |
| `/onboarding` | Authenticated (onboarding may be incomplete) |
| `/agents/**`, `/settings/**`, `/billing/**` | Authenticated |

- Unauthenticated access to a protected route → redirect to `/login?next=<path>` (destination restored after login).
- Authenticated users visiting `/login` or `/signup` → redirect to `/agents`.
- Onboarding completeness is enforced client-side by `RequireAuth` (no private flash: renders nothing until resolved) and server-side helpers are available in `lib/auth/guards.ts` (`requireUser`, `requireCompletedOnboarding`, `getCurrentProfile`, `getSubscriptionAccess`).

## Flows

| Flow | Path |
| --- | --- |
| Email/password signup | `signUp` with `emailRedirectTo=/auth/confirm?next=/onboarding`. If confirmation is enabled (hosted default), the form shows the "check your inbox" state; the email link hits `/auth/confirm` (verifyOtp) → session → `/onboarding`. |
| Login | `signInWithPassword` → profile check → `/agents` or `/onboarding`. |
| Google OAuth | `signInWithOAuth` (PKCE) → provider → `/auth/callback` (code exchange) → onboarding check → `/agents` or `/onboarding`. Apple: UI scaffold present, provider not configured. |
| Forgot password | `resetPasswordForEmail` with `redirectTo=/auth/confirm?next=/reset-password`; the confirm route verifies the recovery token and lands on `/reset-password` where `updateUser({password})` applies. |
| Logout | `signOut` + **full React Query cache clear** (no private data survives), redirect to `/`. |
| Session expiry | Middleware `getUser()` refreshes tokens; an expired/invalid session on a protected route redirects to `/login`. |

## Error handling & i18n

Raw Supabase errors are never shown. `lib/auth/errors.ts` maps error codes (and legacy message heuristics) to translated keys under `auth:errors.*` (en/fr): invalid credentials, unconfirmed email, email in use, weak password, rate limits, expired link/session, etc. Unknown errors fall back to `errors:generic`.

## Profile creation

`public.handle_new_user` (SECURITY DEFINER, idempotent) creates a `profiles` row for every new auth user, copying only harmless metadata (first name, full name, avatar, valid locale). User-editable metadata is never used for authorization. A backfill statement covers pre-existing users.

## Agent-service verification

`services/agent-service/agent_service/auth.py` verifies bearer tokens via JWKS (`SUPABASE_JWKS_URL`, RS256/ES256) with an HS256 fallback (`SUPABASE_JWT_SECRET`), enforcing `exp`, `aud=authenticated` and issuer. Development without configuration uses an unverified decode (loudly logged); production refuses to start unverified. Internal endpoints require `X-Internal-Token` (`INTERNAL_SERVICE_TOKEN`).
