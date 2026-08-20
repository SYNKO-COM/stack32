/**
 * One-shot: pull a Whop membership and fulfill into Stack32 subscriptions.
 *
 * Usage:
 *   set -a && source apps/web/.env.local && set +a && pnpm exec tsx scripts/whop_fulfill_membership.ts mem_XXX
 */
import { fulfillMembershipFromWhop } from "../apps/web/lib/billing/whop-fulfillment";
import { getWhopSdk } from "../apps/web/lib/billing/whop-sdk";
import { createSupabaseAdminClient } from "../apps/web/lib/supabase/admin";

async function main() {
  const memId = process.argv[2];
  if (!memId) throw new Error("Usage: whop_fulfill_membership.ts mem_XXX");

  const whop = getWhopSdk();
  if (!whop) throw new Error("WHOP_API_KEY missing");

  const membership = await whop.memberships.retrieve(memId);
  console.log("retrieved", {
    id: membership.id,
    status: membership.status,
    metadata: membership.metadata,
  });

  await fulfillMembershipFromWhop(membership);

  const admin = createSupabaseAdminClient();
  if (!admin) throw new Error("no admin");

  const userId =
    membership.metadata && typeof membership.metadata === "object"
      ? String((membership.metadata as { stack32_user_id?: string }).stack32_user_id ?? "")
      : "";

  if (!userId) throw new Error("membership missing stack32_user_id");

  const { data: sub, error } = await admin
    .from("subscriptions")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  console.log("subscription_after", sub);

  const { data: ent, error: entErr } = await admin.rpc("resolve_user_entitlements", {
    p_user_id: userId,
  });
  if (entErr) throw entErr;
  console.log("entitlements", ent);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
