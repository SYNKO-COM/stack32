# Mobile and tablet onboarding v3

Reference: `STACK32_ONBOARDING_MOBILE_TABLETTE_SPEC.md`, validated 19 October 2026.

## Scope and device policy

`lib/onboarding/device.ts` pins an experience in session storage. Phone/tablet user agents, coarse multi-touch devices, and iPads presenting as Macintosh use v3, including landscape widths above 1024 px. A narrow desktop window retains desktop onboarding. `/onboarding?experience=mobile` is the explicit authentication/resume destination; it carries no prompt or answers.

Desktop uses the historical four-step component restored from `main` at e9690538. Its storage is separate. Free pricing and the free entry action remain available on desktop. Device classification is presentation, never proof of paid access.

## Persistence and ownership

The anonymous draft is stored locally before navigation. At the account checkpoint a session-scoped adoption intent permits claiming that anonymous UUID for the authenticated account. The server stores one `onboarding_projects` row per account; RLS permits reading only that account's row. The save RPC rejects an ID already claimed by another account, stale saves cannot overwrite newer timestamps, and client saves cannot change preparation or launch statuses. Logout clears anonymous handoff data while account drafts remain keyed by owner.

The active path uses stable functional step IDs. Inactive branch answers stay available for Back but are excluded from the resolved brief. An edited idea overrides its incoming prompt; choosing a guided idea overrides both. Free text and conditional Other fields are optional.

## Actual preparation and launch

The begin RPC locks the project and calls the existing `create_agent_workspace` once. It creates a durable build run. The existing Cloud Tasks/Postgres dispatch sends its ID to the worker, which uses the existing builder's `_generate_spec` engine. Onboarding requires successful model design instead of the interactive builder's fallback. Preparation runs inside the existing builder budget with a 240-second timeout, selects declarative tools and validates both the AgentSpec and executable graph; it does not run an agent, send messages, or invoke integrations. Worker claims are fenced; an expired preparation lease can be reclaimed after interruption; version persistence and readiness commit atomically. Failures retain answers and the agent for retry.

Readiness requires the persisted spec plus the full 50 second presentation. The preview uses the actual existing `StructureGraph` in read-only mode and the prepared tools. `test_status=not_run` remains honest: external tools and the user's runtime model still need their usual setup and tests.

The Use action checks server-side active paid subscription and expiry, including when billing mode is mock. The launch RPC also checks existing entitlements, waits for the sequence, locks the project, and inserts one live run and one user message containing the resolved brief. A queued launch has an atomic worker claim. Reload/payment return reuses that same run. The existing live runtime handles missing BYOK model, connections, and approvals; these requirements are not bypassed. Owner execution of a mobile-prepared agent checks paid rights again. Historical desktop agents and published-agent consumer installation rules retain their existing access behavior.

Explicit review bindings are no longer implicitly approved because enabled tools exist. Their approval is consumed once for the exact run and reviewed arguments; the executing call ID is recorded. The preview does not call an integration's arbitrary `dry_run` path. The A control preference sets actual binding policies; uncertain external side effects conservatively count as sensitive. After-test autonomy stays conditional until the exact persisted spec has a passed test. Model/connection setup resumes the original onboarding run instead of asking for the brief again.

## Billing

Reuse the existing Starter/Pro/Scale catalog and checkout. No product, price, production key or webhook changes are required by v3. A success URL never grants rights. Delayed confirmation offers retry and a return to the prepared draft; cancellation retains it. Existing subscribers use their paid access without repurchase.

Preproduction billing is explicitly mock. Browser tests use local mock entitlements, not card payments or Whop sandbox verification. Real cards, 3DS, PayPal and provider webhooks require a separate configured sandbox validation before production rollout.

## Verification

- Unit tests cover branch selection, conditional information, optional fields, exact 191-value gauge and boundaries, price categories, zero/open-ended scenarios, prompt precedence, active-branch filtering, time assumptions and large-tablet detection.
- pgTAP covers ownership, foreign claims, stale saves, protected statuses, duplicate starts/completions, fencing, paid/expired access, 50 seconds, and one launch/message.
- Python tests cover actual spec persistence, preparation failures, duplicate deliveries, review settings and per-run paid gating.
- Playwright covers desktop signup/four steps/free/build regression, mobile A/B authentication and reloads, prompt preservation, live draft records, actual sequence delay, canceled checkout, mock paid launch once, and large tablet rotations. The browser service fixture is explicitly deterministic and local-only; it is not evidence of a real model or a real payment.
- Physical iOS/Android hardware, Google OAuth provider interaction and real payment rails need their own verification when those test environments/accounts are available.

## Preproduction release order

1. Run the repository checks locally and inspect PR CI (if runners are available); PR base is `preprod`. A pending CI run is not a passing check. Feature and preprod automatic Vercel deployments are disabled.
2. Verify CLI project reference is `fbqjuqnkemlofklrjeuo`; review dry-run migrations and apply only v3 migration.
3. Submit `cloudbuild.preprod.yaml` only; verify both Cloud Run `-preprod` services, their dedicated database and `stack32-runs-preprod` queue.
4. Stage web in Vercel project `prj_Q1gLhC7rGTQwFWTDwj3lYjry68Xs` (`stack32-preprod`) with `--skip-domain`; promote only after validation.
5. Verify `https://pre-prod-659874458xx.stack32.com` on the new deployment and synthetic test accounts. Keep Supabase CLI linked to preproduction. Do not follow the historical instruction to re-link to production.

## Local verification, 19 October 2026

- Web: 305 unit tests; TypeScript and optimized webpack build passed.
- Database: 220 pgTAP assertions passed using the local Supabase stack.
- Backend: 1321 pytest tests passed; Ruff passed.
- Browser: 15 Playwright tests passed, one existing integration smoke skipped because its OAuth fixture is absent. This includes the full desktop/free regression, A's 50-second presentation and single mock-paid launch, B's edited brief and projection, and large iPad orientation persistence.
- On an 8 GB host, build first with `STACK32_LOW_MEMORY_BUILD=1`, then run `E2E_USE_BUILD=1 pnpm --filter @stack32/web test:e2e --workers=1` against local Supabase. Build-time public URLs must match Playwright's localhost URLs. The deterministic local builder fixture and mock billing are not real provider/payment validation.

## Explicit preproduction smoke

`tests/preprod/onboarding.smoke.mjs` requires `STACK32_PREPROD_TEST_ACCOUNT_FILE`, a private JSON file with `url`, `anon`, `user_id`, `email`, `password` and `session.access_token` for a dedicated confirmed `@stack32.test` account. It rejects every database except `fbqjuqnkemlofklrjeuo` and uses only the fixed preproduction domain. Never commit that private file. Run from `apps/web` with `node tests/preprod/onboarding.smoke.mjs` after publishing the validated API and web release. This test invokes the real builder, waits for readiness and the presentation, checks cancellation, uses only the configured mock billing route, verifies one launch and stops at the existing LLM connection requirement. It supplies no external account or runtime key.

## Real preproduction verification

The explicit smoke passed on the published preproduction domain with a dedicated synthetic account: the real builder persisted an 8-node/3-tool draft, readiness waited for the full presentation, cancellation preserved the same agent, mock paid access created exactly one live run, and missing user LLM configuration stopped that run with `LLM_CONFIGURATION_REQUIRED` and the existing connection form. No runtime key, external tool action or real payment was supplied. This verifies the setup pause, not completion of a real BYOK run.

## Presentation revision, 19 October 2026

The latest user review supersedes the original specification on these presentation points: the scenario reference price is now fixed from the selected category (legacy editable values are ignored), the difficulty label is removed, and checkout cancellation returns to offers rather than offering a return to the prepared agent. The four price categories, selected goal, paid entitlement checks and durable draft remain unchanged.

Mobile/tablet now use a fixed-height shell: the transparent logo/header and progress stay outside the question's scroll region. This preserves the dotted background without scrolling text underneath the controls. Desktop retains its original shell and onboarding/free offer.

The two short analysis screens present a 12-second circular sequence. They organize existing answers; they do not claim an LLM was invoked. The final preparation still waits for the real saved spec and the server's 50-second minimum. Its preview uses the application's stored-spec mapper, product graph adapter, layout and node components, with progressively revealed nodes and drawn links. It has no drag, zoom, controls or configuration drawers. Until a real spec exists it shows an explicit waiting placeholder rather than fabricated modules.

The four teaching screens use distinct conversation, test, demonstration and acquisition compositions. Projection counts to the exact chosen goal, with / mois beside it, a one-shot entrance/chart effect and an optional locally synthesized chime. Audio is unlocked only by a user gesture, may be muted and is not required for progression. Reduced motion retains every label and progress value. The fixed scenario assumption is identified as a hypothesis, and sales counts use the existing ceiling calculation; no sale or guaranteed earnings are implied.

The final screen keeps the actual structure, name, concise objective and use action. Extra tool inventory, technical preparation notes and expandable mission are removed. No API/runtime authorization, database migration, production price, credential, webhook or external integration is changed in this revision.
