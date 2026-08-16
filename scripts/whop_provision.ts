/**
 * Provision Whop products + base plans for Stack32.
 *
 * Usage:
 *   WHOP_API_KEY=... WHOP_COMPANY_ID=biz_... \
 *     pnpm exec tsx scripts/whop_provision.ts
 *
 * Creates 3 products (Starter / Pro / Scale) and 6 base plans
 * (monthly + annual at default credit tiers). Prints env vars to paste into Vercel.
 */

import Whop from "@whop/sdk";

type Spec = {
  key: "starter" | "pro" | "scale";
  title: string;
  description: string;
  monthly: number;
  annualYearly: number; // charged once per year
  credits: number;
};

const SPECS: Spec[] = [
  {
    key: "starter",
    title: "Stack32 Starter",
    description: "Publish up to 5 agents. 100 Builder credits / month included.",
    monthly: 24,
    annualYearly: 240,
    credits: 100,
  },
  {
    key: "pro",
    title: "Stack32 Pro",
    description: "Up to 30 agents, monetization, beta access. 200 credits / month.",
    monthly: 49,
    annualYearly: 480,
    credits: 200,
  },
  {
    key: "scale",
    title: "Stack32 Scale",
    description: "Unlimited agents and workspaces. 400 credits / month.",
    monthly: 99,
    annualYearly: 960,
    credits: 400,
  },
];

async function main() {
  const apiKey = process.env.WHOP_API_KEY?.trim();
  const companyId = process.env.WHOP_COMPANY_ID?.trim();
  if (!apiKey || !companyId) {
    console.error("Set WHOP_API_KEY and WHOP_COMPANY_ID before running.");
    process.exit(1);
  }

  const client = new Whop({ apiKey });
  const out: Record<string, string> = {
    WHOP_COMPANY_ID: companyId,
  };

  for (const spec of SPECS) {
    console.log(`\n→ Creating product ${spec.title}…`);
    const product = await client.products.create({
      account_id: companyId,
      title: spec.title,
      description: spec.description,
      visibility: "visible",
      metadata: { stack32_plan_key: spec.key, source: "stack32_provision" },
    });
    console.log(`  product: ${product.id}`);
    out[`WHOP_PRODUCT_${spec.key.toUpperCase()}_ID`] = product.id;

    const monthly = await client.plans.create({
      account_id: companyId,
      product_id: product.id,
      plan_type: "renewal",
      currency: "usd",
      billing_period: 30,
      initial_price: spec.monthly,
      renewal_price: spec.monthly,
      title: `${spec.key} monthly`.slice(0, 30),
      visibility: "visible",
      unlimited_stock: true,
      metadata: {
        stack32_plan_key: spec.key,
        billing_interval: "monthly",
        credits_monthly: String(spec.credits),
        source: "stack32_provision",
      },
    });
    console.log(`  monthly plan: ${monthly.id} ($${spec.monthly}/mo)`);
    out[`WHOP_PLAN_${spec.key.toUpperCase()}_MONTHLY_ID`] = monthly.id;

    const annual = await client.plans.create({
      account_id: companyId,
      product_id: product.id,
      plan_type: "renewal",
      currency: "usd",
      billing_period: 365,
      initial_price: spec.annualYearly,
      renewal_price: spec.annualYearly,
      title: `${spec.key} annual`.slice(0, 30),
      visibility: "visible",
      unlimited_stock: true,
      metadata: {
        stack32_plan_key: spec.key,
        billing_interval: "annual",
        credits_monthly: String(spec.credits),
        source: "stack32_provision",
      },
    });
    console.log(`  annual plan: ${annual.id} ($${spec.annualYearly}/yr)`);
    out[`WHOP_PLAN_${spec.key.toUpperCase()}_ANNUAL_ID`] = annual.id;
  }

  console.log("\n=== Paste into Vercel / .env ===\n");
  console.log("BILLING_MODE=whop");
  for (const [k, v] of Object.entries(out)) {
    console.log(`${k}=${v}`);
  }
  console.log(
    "\nAlso set WHOP_API_KEY and WHOP_WEBHOOK_SECRET (from Developer → Webhooks).",
  );
  console.log(
    `Webhook URL: https://<your-domain>/api/webhooks/whop\nEvents: membership.activated, membership.deactivated, payment.succeeded, payment.failed, refund.created`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
