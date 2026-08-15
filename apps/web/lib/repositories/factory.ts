import { isSupabaseConfigured } from "@/lib/env";
import { USE_MOCK_DATA } from "@/lib/site";

import type {
  AgentRepository,
  AuthRepository,
  BillingRepository,
  BuilderRepository,
  KnowledgeRepository,
  LiveRepository,
  WorkspaceRepository,
} from "./interfaces";
import { MockAgentRepository } from "./mock/agents";
import { MockAuthRepository } from "./mock/auth";
import { MockBillingRepository } from "./mock/billing";
import { MockBuilderRepository } from "./mock/builder";
import { MockKnowledgeRepository } from "./mock/knowledge";
import { MockLiveRepository } from "./mock/live";
import { MockWorkspaceRepository } from "./mock/workspaces";
import { SupabaseAgentRepository } from "./supabase/agents";
import { SupabaseAuthRepository } from "./supabase/auth";
import { SupabaseBillingRepository } from "./supabase/billing";
import { SupabaseBuilderRepository } from "./supabase/builder";
import { SupabaseKnowledgeRepository } from "./supabase/knowledge";
import { SupabaseLiveRepository } from "./supabase/live";
import { SupabaseWorkspaceRepository } from "./supabase/workspaces";

/**
 * Repository factory — the single place where the data mode is decided.
 *
 * NEXT_PUBLIC_DATA_MODE=supabase → real Supabase-backed repositories.
 * NEXT_PUBLIC_DATA_MODE=mock     → localStorage mocks (isolated frontend dev).
 *
 * UI components never check the mode themselves: they depend on these
 * interfaces (usually through the TanStack Query hooks).
 */

function shouldUseSupabase(): boolean {
  if (USE_MOCK_DATA) return false;
  if (!isSupabaseConfigured) {
    console.warn(
      "[stack32] NEXT_PUBLIC_DATA_MODE=supabase but Supabase env vars are missing. Falling back to mocks.",
    );
    return false;
  }
  return true;
}

let auth: AuthRepository | undefined;
let agents: AgentRepository | undefined;
let workspaces: WorkspaceRepository | undefined;
let builder: BuilderRepository | undefined;
let live: LiveRepository | undefined;
let billing: BillingRepository | undefined;
let knowledge: KnowledgeRepository | undefined;

export function getAuthRepository(): AuthRepository {
  auth ??= shouldUseSupabase() ? new SupabaseAuthRepository() : new MockAuthRepository();
  return auth;
}

export function getAgentRepository(): AgentRepository {
  agents ??= shouldUseSupabase() ? new SupabaseAgentRepository() : new MockAgentRepository();
  return agents;
}

export function getWorkspaceRepository(): WorkspaceRepository {
  workspaces ??= shouldUseSupabase()
    ? new SupabaseWorkspaceRepository()
    : new MockWorkspaceRepository();
  return workspaces;
}

export function getBuilderRepository(): BuilderRepository {
  builder ??= shouldUseSupabase() ? new SupabaseBuilderRepository() : new MockBuilderRepository();
  return builder;
}

export function getLiveRepository(): LiveRepository {
  live ??= shouldUseSupabase() ? new SupabaseLiveRepository() : new MockLiveRepository();
  return live;
}

export function getBillingRepository(): BillingRepository {
  billing ??= shouldUseSupabase() ? new SupabaseBillingRepository() : new MockBillingRepository();
  return billing;
}

export function getKnowledgeRepository(): KnowledgeRepository {
  knowledge ??= shouldUseSupabase() ? new SupabaseKnowledgeRepository() : new MockKnowledgeRepository();
  return knowledge;
}
