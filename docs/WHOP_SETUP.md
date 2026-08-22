# Whop billing — production setup

Stack32 uses **3 Whop products** (Starter / Pro / Scale), each with monthly + annual base plans. Extra credit tiers are priced at checkout via an inline renewal plan attached to the same product ([Accept payments](https://docs.whop.com/developer/guides/accept-payments), [Checkout embed](https://docs.whop.com/payments/checkout-embed)).

> **Important:** Whop’s `initial_price` is a one-time setup fee charged **on top of** the first `renewal_price`. For normal Stack32 subscriptions, always set `initial_price: 0` and put the subscription amount only on `renewal_price` (otherwise day-one total is doubled).

## What you must provide

| Secret / ID | Where to get it | Used for |
| --- | --- | --- |
| **`WHOP_API_KEY`** | [Dashboard → Developer](https://whop.com/dashboard/developer) → Account API Keys | Create checkout sessions, provision products |
| **`WHOP_COMPANY_ID`** | Dashboard → Settings (`biz_…`) | Company / account id |
| **`WHOP_WEBHOOK_SECRET`** | Create webhook → copy secret once (`ws_…`) | Verify [webhooks](https://docs.whop.com/developer/guides/webhooks) |
| **Product IDs** | Output of provision script (`prod_…`) | Attach checkouts to the right product |
| **Base plan IDs** (optional but recommended) | Same script (`plan_…`) | Fast path for default credit tiers |

Permissions on the API key (minimum):

- `access_pass:create` / `access_pass:update` (products + plans + checkout configs)
- `payment:basic:read` / membership read scopes used by webhooks
- Webhook receive for memberships + payments

## Steps

### 1. Provision products

```bash
WHOP_API_KEY=... WHOP_COMPANY_ID=biz_... pnpm exec tsx scripts/whop_provision.ts
```

Paste the printed `WHOP_PRODUCT_*` / `WHOP_PLAN_*` into **Vercel → Environment Variables** (Production).

### 2. Webhook

Create a webhook pointing to:

```text
https://stack32.com/api/webhooks/whop
```

Subscribe at least to (API v5 names):

- `membership.went_valid` (alias historique: `membership.activated`)
- `membership.went_invalid` (alias historique: `membership.deactivated`)
- `payment.succeeded`
- `payment.failed`
- `refund.created` (optional)

Store the signing secret as `WHOP_WEBHOOK_SECRET`.

> Your Company API key needs the `developer:manage_webhook` scope to create webhooks via API.
> Otherwise create the webhook in the Whop dashboard (Developer → Webhooks) and paste the `ws_…` secret into Vercel.

### 3. Vercel env

```bash
BILLING_MODE=whop
WHOP_API_KEY=...
WHOP_COMPANY_ID=biz_...
WHOP_WEBHOOK_SECRET=ws_...
WHOP_PRODUCT_STARTER_ID=prod_...
WHOP_PRODUCT_PRO_ID=prod_...
WHOP_PRODUCT_SCALE_ID=prod_...
WHOP_PLAN_STARTER_MONTHLY_ID=plan_...
WHOP_PLAN_STARTER_ANNUAL_ID=plan_...
WHOP_PLAN_PRO_MONTHLY_ID=plan_...
WHOP_PLAN_PRO_ANNUAL_ID=plan_...
WHOP_PLAN_SCALE_MONTHLY_ID=plan_...
WHOP_PLAN_SCALE_ANNUAL_ID=plan_...
NEXT_PUBLIC_APP_URL=https://<your-domain>
```

Redeploy after saving.

### 4. Apple Pay (embedded checkout)

Only needed if you want Apple Pay on the embed: verify the domain in [checkout settings](https://docs.whop.com/payments/apple-pay). Hosted Whop checkout links already support Apple Pay.

### 5. Sandbox test

Use [sandbox](https://docs.whop.com/developer/guides/sandbox) + a test card, then confirm:

1. Checkout on `/billing/checkout?plan=starter&interval=monthly&credits=100`
2. Webhook delivery `membership.activated` → `200`
3. `subscriptions` row updated (`plan_key`, `credits_monthly`)
4. Topbar credits limit matches the plan

## Flow (code)

1. Pricing → `/billing/checkout?plan=&interval=&credits=`
2. Server creates `checkoutConfigurations` with metadata (`stack32_user_id`, `plan_key`, …)
3. `WhopCheckoutEmbed` (`sessionId`) collects payment
4. Webhook verifies signature → fulfills `subscriptions`
5. Credits / budgets come from existing entitlement RPCs

## One-time credit top-ups

Paid subscribers can buy extra Builder credits without changing their plan:

1. Menu compte → **Acheter plus de crédits**
2. Slider 50–10 000 (pas de 50) → checkout Whop `plan_type: one_time`
3. Webhook `payment.succeeded` (metadata `kind=credit_topup`) → row in `credit_topups`
4. `resolve_user_entitlements` adds those credits + AI budget to the **current period only**

Optional env: `WHOP_PRODUCT_CREDITS_ID` (defaults to `WHOP_PRODUCT_STARTER_ID`).

Sell price: **$0.43 / credit** · platform budget: **$0.06 / credit** (~86% gross margin on packs).

When the subscriber already has a Whop **member** + saved payment method (from subscription checkout with `setupFutureUsage: "off_session"`), top-ups charge off-session via `payments.create` and skip the embed. Otherwise the larger checkout embed is shown.

## Docs index

- [Accept payments](https://docs.whop.com/developer/guides/accept-payments)
- [Save payment methods](https://docs.whop.com/developer/guides/save-payment-methods)
- [Webhooks](https://docs.whop.com/developer/guides/webhooks)
- [Checkout embed](https://docs.whop.com/payments/checkout-embed)
- [API overview](https://docs.whop.com/api-reference/beta/overview)
- [Refunds & disputes](https://docs.whop.com/developer/guides/refunds-and-disputes)
