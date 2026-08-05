import "server-only";

import {
  agentServiceFetch,
  requireAccessToken,
} from "@/lib/ai/agent-service-client";
import { getAiExecutionMode } from "@/lib/env.server";

/**
 * Execution adapters — the single boundary between persistence (Phase 2) and
 * the real AI runtime (Phase 3+).
 *
 * MockBuilderExecutionAdapter / MockLiveExecutionAdapter simulate the approved
 * Phase 1 UI progression while persisting everything to Supabase through
 * trusted server code. RealBuilderExecutionAdapter / RealLiveExecutionAdapter
 * delegate to the Agent Service API when AI_EXECUTION_MODE=agent-service.
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

/** Calls the Agent Service builder endpoints; persistence is handled server-side. */
export class RealBuilderExecutionAdapter implements BuilderExecutionAdapter {
  async execute({ agentId, threadId, prompt }: BuilderExecutionInput): Promise<void> {
    const accessToken = await requireAccessToken();
    await agentServiceFetch(`/v1/agents/${agentId}/builder/messages`, {
      method: "POST",
      accessToken,
      body: { content: prompt, thread_id: threadId },
    });
  }

  async repair({ agentId }: Omit<BuilderExecutionInput, "prompt">): Promise<void> {
    const accessToken = await requireAccessToken();
    await agentServiceFetch(`/v1/agents/${agentId}/repair`, {
      method: "POST",
      accessToken,
      body: {},
    });
  }
}

/** Calls the Agent Service live runtime; persistence is handled server-side. */
export class RealLiveExecutionAdapter implements LiveExecutionAdapter {
  async execute({ threadId, prompt }: LiveExecutionInput): Promise<void> {
    const accessToken = await requireAccessToken();
    await agentServiceFetch(`/v1/live/threads/${threadId}/messages`, {
      method: "POST",
      accessToken,
      body: { content: prompt, use_published: false },
    });
  }
}

export type AiExecutionMode = "mock" | "disabled" | "agent-service";

export function currentAiExecutionMode(): AiExecutionMode {
  return getAiExecutionMode();
}
