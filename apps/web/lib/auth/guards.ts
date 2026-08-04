import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";
import type { User } from "@supabase/supabase-js";

import { getBillingMode } from "@/lib/env.server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
type SubscriptionRow = Database["public"]["Tables"]["subscriptions"]["Row"];

/**
 * Server-side auth guards. Use these in Server Components, Route Handlers and
 * Server Actions instead of duplicating auth checks everywhere.
 */

export const getCurrentUser = cache(async (): Promise<User | null> => {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

export const getCurrentProfile = cache(async (): Promise<ProfileRow | null> => {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const user = await getCurrentUser();
  if (!user) return null;
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  return data;
});

/** Redirects to /login when unauthenticated; returns the user otherwise. */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Redirects to /onboarding when onboarding is incomplete. */
export async function requireCompletedOnboarding(): Promise<ProfileRow> {
  await requireUser();
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!profile.onboarding_completed) redirect("/onboarding");
  return profile;
}

export interface SubscriptionAccess {
  hasAccess: boolean;
  status: string;
  subscription: SubscriptionRow | null;
  mode: "mock" | "whop";
}

/**
 * Billing gating abstraction. In mock mode (development / pre-Whop), access is
 * granted and clearly labeled as mocked. In whop mode, access requires an
 * active or trialing subscription row (populated by webhooks in Phase 7).
 */
export async function getSubscriptionAccess(): Promise<SubscriptionAccess> {
  const mode = getBillingMode();
  const supabase = await createSupabaseServerClient();
  const user = await getCurrentUser();

  let subscription: SubscriptionRow | null = null;
  if (supabase && user) {
    const { data } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();
    subscription = data;
  }

  if (mode === "mock") {
    return { hasAccess: true, status: subscription?.status ?? "active", subscription, mode };
  }

  const active =
    subscription !== null && ["active", "trialing"].includes(subscription.status);
  return {
    hasAccess: active,
    status: subscription?.status ?? "inactive",
    subscription,
    mode,
  };
}
