import "server-only";

import { getAiExecutionMode } from "@/lib/env.server";

/**
 * Execution adapters — the single boundary between persistence (Phase 2) and
 * the future real AI runtime (Phase 3+).
 *
 * MockBuilderExecutionAdapter / MockLiveExecutionAdapter simulate the approved
 * Phase 1 UI progression while persisting everything to Supabase through
 * trusted server code. RealBuilderExecutionAdapter / RealLiveExecutionAdapter
 * throw NOT_IMPLEMENTED until the real agent runtime lands.
 */

export interface BuilderExecutionInput {
  userId: string;
  agentId: string;
  threadId: string;
  prompt: string;
}

export interface LiveExecutionInput {
  userId: string;
  agentId: string;
  threadId: string;
  prompt: string;
}

export interface BuilderExecutionAdapter {
  execute(input: BuilderExecutionInput): Promise<void>;
  repair(input: Omit<BuilderExecutionInput, "prompt">): Promise<void>;
}

export interface LiveExecutionAdapter {
  execute(input: LiveExecutionInput): Promise<void>;
}

export class NotImplementedError extends Error {
  readonly code = "NOT_IMPLEMENTED";

  constructor(feature: string) {
    super(`${feature} is not implemented yet (Phase 3+)`);
    this.name = "NotImplementedError";
  }
}

export class RealBuilderExecutionAdapter implements BuilderExecutionAdapter {
  async execute(): Promise<void> {
    throw new NotImplementedError("Real builder execution");
  }

  async repair(): Promise<void> {
    throw new NotImplementedError("Real builder repair");
  }
}

export class RealLiveExecutionAdapter implements LiveExecutionAdapter {
  async execute(): Promise<void> {
    throw new NotImplementedError("Real live execution");
  }
}

export type AiExecutionMode = "mock" | "disabled";

export function currentAiExecutionMode(): AiExecutionMode {
  return getAiExecutionMode();
}
