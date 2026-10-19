"use server";

import { z } from "zod";
import { requireSupabaseServerClient } from "@/lib/supabase/server";
import { agentServiceFetch, requireAccessToken } from "@/lib/ai/agent-service-client";
import { journeySchema, resolveBrief, type Journey } from "@/lib/onboarding/journey";
import type { GraphSpec } from "@/lib/domain/types";
import type { SupabaseClient } from "@supabase/supabase-js";

export type OnboardingProject = { id: string; user_id: string; state: Journey; status: "draft" | "preparing" | "ready" | "failed" | "launched"; agent_id: string | null; version_id: string | null; preparation_run_id: string | null; launch_run_id: string | null; preparation_started_at: string | null; error_code: string | null; brief: string | null };
export type PreparedSpec = { identity: { name: string }; graph: GraphSpec; tools: { tool_id: string; provider?: string; approval_mode?: string }[]; connection_requirements?: { provider: string; app_id?: string }[] };
async function client() {
  const db = await requireSupabaseServerClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) throw new Error("UNAUTHENTICATED");
  return { db: db as SupabaseClient, user };
}
export async function getMobileProject(): Promise<{ userId: string; project: OnboardingProject | null; spec: PreparedSpec | null; paid: boolean }> {
  const { db, user } = await client();
  const { data, error } = await db.from("onboarding_projects").select("*").eq("user_id", user.id).maybeSingle();
  if (error) throw new Error("PROJECT_LOAD_FAILED");
  const project = data as OnboardingProject | null;
  let spec: PreparedSpec | null = null;
  if (project?.version_id) {
    const result = await db.from("agent_versions").select("spec").eq("id", project.version_id).maybeSingle();
    if (result.error) throw new Error("PROJECT_LOAD_FAILED");
    spec = result.data?.spec as PreparedSpec | null;
  }
  const { data: sub, error: subError } = await db.from("subscriptions").select("plan_key,status,current_period_end").eq("user_id", user.id).maybeSingle();
  if (subError) throw new Error("ACCESS_CHECK_FAILED");
  const paid = Boolean(sub && ["starter", "pro", "scale"].includes(sub.plan_key) && ["active", "trialing"].includes(sub.status) && (!sub.current_period_end || Date.parse(sub.current_period_end) > Date.now()));
  return { userId: user.id, project, spec, paid };
}
export async function saveMobileProject(id: string, state: Journey, expectedOwner: string): Promise<OnboardingProject> {
  z.uuid().parse(id);
  const parsed = journeySchema.parse(state);
  const { db, user } = await client();
  if (user.id !== expectedOwner) throw new Error("ACCOUNT_CHANGED");
  const { data, error } = await db.rpc("save_onboarding_project", { p_id: id, p_state: parsed });
  if (error) throw new Error(error.message.includes("draft_already_claimed") ? "DRAFT_ALREADY_CLAIMED" : "PROJECT_SAVE_FAILED");
  return data as OnboardingProject;
}
export async function completeMobileCheckpoint(expectedOwner: string) {
  const { db, user } = await client();
  if (user.id !== expectedOwner) throw new Error("ACCOUNT_CHANGED");
  const { error } = await db.rpc("complete_mobile_onboarding_checkpoint");
  if (error) throw new Error("PROJECT_SAVE_FAILED");
}
export async function dispatchMobileProject() {
  return agentServiceFetch<{ status?: string }>("/v1/onboarding/dispatch", { method: "POST", accessToken: await requireAccessToken() });
}
export async function prepareMobileProject(expectedOwner: string): Promise<OnboardingProject> {
  const { project, userId } = await getMobileProject();
  if (userId !== expectedOwner) throw new Error("ACCOUNT_CHANGED");
  if (!project) throw new Error("PROJECT_MISSING");
  const state = journeySchema.parse(project.state);
  const { db } = await client();
  const { data, error } = await db.rpc("begin_onboarding_preparation", { p_brief: resolveBrief(state), p_control: String(state.answers["a.control"] ?? "Sur les cas sensibles") });
  if (error) throw new Error(error.message.includes("plan_agent_limit") ? "PLAN_AGENT_LIMIT" : "PREPARATION_START_FAILED");
  // A queue outage must not lose a durable preparation. Polling retries dispatch
  // of this same run, and never creates another agent.
  try { await dispatchMobileProject(); } catch { /* retry from the build screen */ }
  return data as OnboardingProject;
}
export async function launchMobileProject(): Promise<{ paywall: boolean; path?: string }> {
  const { project, paid } = await getMobileProject();
  if (!paid) return { paywall: true };
  if (!project) throw new Error("PROJECT_MISSING");
  const { db } = await client();
  const { data, error } = await db.rpc("launch_onboarding_agent");
  if (error) throw new Error("LAUNCH_FAILED");
  const launched = data as OnboardingProject;
  await dispatchMobileProject();
  return { paywall: false, path: `/agents/${launched.agent_id}/agent` };
}

export async function resumeMobileLaunchAfterSetup(agentId: string) {
  z.uuid().parse(agentId);
  const { project, paid } = await getMobileProject();
  if (!project || project.agent_id !== agentId || project.status !== "launched") return;
  if (!paid) throw new Error("PAID_ACCESS_REQUIRED");
  await agentServiceFetch("/v1/onboarding/resume", { method: "POST", accessToken: await requireAccessToken() });
}
