/**
 * Recreate the TEST promo at 100% off.
 *
 * A 99% promo leaves residual amounts like $0.49 (Pro) which are below Stripe's
 * $0.50 USD minimum for non-zero charges, so checkout Join fails.
 *
 * Usage:
 *   set -a && source apps/web/.env.local && set +a && pnpm exec tsx scripts/whop_fix_test_promo.ts
 */
const apiKey = process.env.WHOP_API_KEY;
const companyId = process.env.WHOP_COMPANY_ID || process.env.NEXT_PUBLIC_WHOP_COMPANY_ID;

if (!apiKey || !companyId) {
  throw new Error("WHOP_API_KEY and WHOP_COMPANY_ID are required");
}

async function listPromos() {
  const url = new URL("https://api.whop.com/api/v1/promo_codes");
  url.searchParams.set("company_id", companyId!);
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`list failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as {
    data: Array<{ id: string; code: string | null; amount_off: number; status: string }>;
  };
}

async function setStatus(id: string, status: "active" | "inactive") {
  const res = await fetch(`https://api.whop.com/api/v1/promo_codes/${id}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error(`status ${status} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function createHundredPercentTest() {
  const res = await fetch("https://api.whop.com/api/v1/promo_codes", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      company_id: companyId,
      amount_off: 100,
      base_currency: "usd",
      code: "TEST",
      promo_type: "percentage",
      new_users_only: false,
      unlimited_stock: true,
      numberOfIntervals: 0,
    }),
  });
  if (!res.ok) throw new Error(`create failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function main() {
  const listed = await listPromos();
  for (const promo of listed.data) {
    const code = (promo.code || "").toLowerCase();
    if (code === "test" && promo.status === "active" && promo.amount_off < 1) {
      console.log(`Deactivating ${promo.id} amount_off=${promo.amount_off}`);
      await setStatus(promo.id, "inactive");
    }
  }

  const activeHundred = listed.data.find(
    (p) => (p.code || "").toLowerCase() === "test" && p.status === "active" && p.amount_off >= 1,
  );
  if (activeHundred) {
    console.log(`Already OK: ${activeHundred.id} amount_off=${activeHundred.amount_off}`);
    return;
  }

  const created = await createHundredPercentTest();
  console.log("Created", created.id, "amount_off=", created.amount_off, "code=", created.code);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
