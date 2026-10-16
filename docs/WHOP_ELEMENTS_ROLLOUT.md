# Whop Elements, mobile and onboarding — October 2026

## Scope and implementation

Work starts at preprod `c04ee6b`, on `codex/checkout-onboarding-preprod`.
Deploy only to Vercel `stack32-preprod` (`prj_Q1gLhC7rGTQwFWTDwj3lYjry68Xs`),
domain `https://pre-prod-659874458xx.stack32.com`, Supabase project
`fbqjuqnkemlofklrjeuo`. No migration, production deployment or Chrome extension changes.

- Mobile hero title uses a fluid 36–48px size below the existing desktop breakpoints.
- Prompt submission shows progress and prevents duplicate submission. Route loading
  boundaries provide immediate navigation feedback. Hero text is visible before hydration.
- Nine onboarding steps: objective, role, idea, audience, first result, profile,
  discovery (optional), workspace and recap. Existing landing prompts are reused;
  answers survive reload per account. The first five questions are public; the
  authentication checkpoint then adopts the anonymous draft once. Suggestions are
  editable examples, not a promise of specialized agent templates or earnings.
- A local 50-second animated blueprint follows the questions, with an immediate
  preview option and reduced-motion support. It explicitly describes a preview,
  never a completed live agent. Name selection precedes the paid plan picker.
  No agent creation/build is triggered here. The saved brief is handed to the
  existing builder only after an active paid subscription is observed.
- Free is removed from public offers and the plan picker, including SEO offers.
  Historical free entitlement definitions and existing accounts are preserved.
  This is not a retroactive change to their subscriptions. Draft continuity is
  device-local; closing the tab keeps the account draft in local storage.
- Official Elements 1.9.0 replace `@whop/checkout`. Email, billing address and
  payment methods use Whop elements. Card details never enter Stack32 fields.
- Payment fields appear immediately; our final subscription button requires two
  explicit consents, a complete method and a signed, unexpired Whop total including tax.
  The server independently checks the buyer, merchant, configuration, quote and consents.
- One token and idempotency key are retained when a charge has an ambiguous network
  outcome. A retry resumes that attempt. Never switch checkouts to retry an uncertain
  charge; check its status first. A page reload is not a transaction recovery mechanism.
- Whop handles 3DS and redirects. Return pages verify payment ownership/status server-side;
  query parameters never grant access. Webhooks resolve payment membership references
  before fulfillment and return a retryable failure when resolution fails.
- The complete official Elements checkout remains available before an attempt,
  including for unsupported payment methods. In that fallback, the whole embed is
  locked until both consents. Credit top-ups use the full official Elements checkout.
- The legacy membership SDK is retained; the aliased official SDK 2.5.0 handles
  quotes and confirmation-token payments. Do not remove the old SDK without migrating
  its existing membership, catalog and webhook callers.

## Configuration and remaining release gates

The preproduction project currently retains `BILLING_MODE=mock`; no real or simulated
payment transaction is performed there for this task. Its existing mock checkout
route remains development functionality, not evidence of a successful Whop integration.

Production Whop variable **names** were inspected with permission. Vercel reports
them as sensitive and does not return their values. No credentials were copied;
no production setting was changed. Never copy Supabase, application URLs or webhook
signing secrets between environments. A webhook secret belongs to its endpoint.

Before a separately authorized public rollout:

1. Confirm `WHOP_API_KEY`, `WHOP_COMPANY_ID`, all three product IDs and six base
   plan IDs from `WHOP_SETUP.md`; include the credit product configuration if used.
   Verify the key can create payment quotes and confirmation-token payments and
   read payments, checkout configurations and memberships. Missing scopes must fail
   closed; the existence of an API key does not prove those permissions.
2. Verify the merchant's actual payment-method eligibility and payment domains
   through Whop. Apple Pay, Google Pay and PayPal availability depends on merchant,
   buyer, device and domain. No fake wallet button is provided. PayPal connected
   directly to a merchant is incompatible with the quotes API according to the
   current docs: use the full official checkout fallback for that setup.
3. Verify the signing secret and subscribed events on the destination webhook.
   Test first purchase and renewal mapping to a `mem_` subscription, credits,
   duplicate deliveries, delayed membership creation and failed-delivery retries.
4. In an authorized payment test environment, exercise success, decline, 3DS
   acceptance/cancellation, wallet redirects, tax/promo changes, network loss,
   duplicate click/retry, full-checkout fallback and credits. Also test spoofed
   return URLs and another buyer's payment ID. These are **not** validated by mocked
   unit tests or a successful application build.
5. Deploy to production only with separate authorization. The vendor's supplied
   notice says the legacy embed stops on **21 October 2026**. Preproduction rollout
   does not remove that production deadline. Do not roll back to the legacy embed
   after shutdown; use the new full Elements checkout if custom fields need fallback.

No software or payment provider can be promised 100% availability. No live charge,
3DS challenge, PayPal activation or merchant domain registration has been validated
in this task. The implementation is prepared for those checks, not proof they passed.

## Official references consulted

- [Checkout Elements](https://docs.whop.com/elements/latest/checkout/checkout)
- [Embed checkout](https://docs.whop.com/developer/guides/embed-checkout)
- [Payment Elements](https://docs.whop.com/developer/guides/payment-elements)
- [Whop webhooks](https://docs.whop.com/developer/guides/webhooks)

Onboarding references observed: Polsia's public choice/idea path and the authorized
existing project dashboard, and GetMyFirstSaaS's public experience/education steps.
No Polsia project was created or modified. Stack32 keeps its own content, UI and
agent creation logic; third-party revenue claims are not reproduced.
