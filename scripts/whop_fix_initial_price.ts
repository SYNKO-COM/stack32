/**
 * Fix existing Whop base plans that incorrectly set initial_price = renewal_price
 * (Whop charges initial_price ON TOP of the first renewal, doubling day-one total).
 *
 * Usage:
 *   set -a && source apps/web/.env.local && set +a
 *   pnpm exec tsx scripts/whop_fix_initial_price.ts
 */

import Whop from "@whop/sdk";

const PLAN_ENV_KEYS = [
  "WHOP_PLAN_STARTER_MONTHLY_ID",
  "WHOP_PLAN_STARTER_ANNUAL_ID",
  "WHOP_PLAN_PRO_MONTHLY_ID",
  "WHOP_PLAN_PRO_ANNUAL_ID",
  "WHOP_PLAN_SCALE_MONTHLY_ID",
  "WHOP_PLAN_SCALE_ANNUAL_ID",
] as const;

async function main() {
  const apiKey = process.env.WHOP_API_KEY?.trim();
  if (!apiKey) {
    console.error("Set WHOP_API_KEY before running.");
    process.exit(1);
  }

  const client = new Whop({ apiKey });
  let updated = 0;

  for (const envKey of PLAN_ENV_KEYS) {
    const planId = process.env[envKey]?.trim();
    if (!planId) {
      console.log(`skip ${envKey} (not set)`);
      continue;
    }

    const before = await client.plans.retrieve(planId);
    console.log(
      `${envKey}=${planId}  initial=${before.initial_price} renewal=${before.renewal_price}`,
    );

    if (Number(before.initial_price) === 0) {
      console.log(`  already fixed`);
      continue;
    }

    const after = await client.plans.update(planId, { initial_price: 0 });
    console.log(
      `  → updated initial=${after.initial_price} renewal=${after.renewal_price}`,
    );
    updated += 1;
  }

  console.log(`\nDone. Updated ${updated} plan(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
