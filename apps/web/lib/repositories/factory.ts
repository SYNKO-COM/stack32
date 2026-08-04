import { USE_MOCK_DATA } from "@/lib/site";

import type {
  AgentRepository,
  AuthRepository,
  BillingRepository,
  BuilderRepository,
  KnowledgeRepository,
  LiveRepository,
} from "./interfaces";
import { MockAgentRepository } from "./mock/agents";
import { MockAuthRepository } from "./mock/auth";
import { MockBillingRepository } from "./mock/billing";
import { MockBuilderRepository } from "./mock/builder";
import { MockKnowledgeRepository } from "./mock/knowledge";
import { MockLiveRepository } from "./mock/live";

/**
 * Repository factory.
 *
 * Phase 1: always returns mock implementations (also when Supabase env vars
 * are missing). TODO(phase-2/3): return Supabase / agent-service backed
 * implementations when USE_MOCK_DATA is false.
 */

function assertMockMode(): void {
  if (!USE_MOCK_DATA) {
    // Real implementations are not available yet — fall back to mocks loudly.
    console.warn(
      "[stack32] NEXT_PUBLIC_USE_MOCK_DATA=false but real repositories are not implemented yet (Phase 2+). Using mocks.",
    );
  }
}

let auth: AuthRepository | undefined;
let agents: AgentRepository | undefined;
let builder: BuilderRepository | undefined;
let live: LiveRepository | undefined;
let billing: BillingRepository | undefined;
let knowledge: KnowledgeRepository | undefined;

export function getAuthRepository(): AuthRepository {
  assertMockMode();
  auth ??= new MockAuthRepository();
  return auth;
}

export function getAgentRepository(): AgentRepository {
  assertMockMode();
  agents ??= new MockAgentRepository();
  return agents;
}

export function getBuilderRepository(): BuilderRepository {
  assertMockMode();
  builder ??= new MockBuilderRepository();
  return builder;
}

export function getLiveRepository(): LiveRepository {
  assertMockMode();
  live ??= new MockLiveRepository();
  return live;
}

export function getBillingRepository(): BillingRepository {
  assertMockMode();
  billing ??= new MockBillingRepository();
  return billing;
}

export function getKnowledgeRepository(): KnowledgeRepository {
  assertMockMode();
  knowledge ??= new MockKnowledgeRepository();
  return knowledge;
}
