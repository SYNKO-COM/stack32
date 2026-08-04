import type { BuilderMessage, BuilderThread, BuildStep } from "@/lib/domain/types";
import type { BuilderRepository } from "@/lib/repositories/interfaces";

import { makeSpecForPrompt, setAgentStatus, upsertAgentSpec } from "./agents";
import { emitMockChange } from "./events";
import { generateId, nowIso, readStore, writeStore } from "./storage";

interface BuilderState {
  threads: Record<string, BuilderThread>;
}

const KEY = "builder";
const STEP_KEYS = ["understanding", "capabilities", "building", "testing"];

function readState(): BuilderState {
  return readStore<BuilderState>(KEY, { threads: {} });
}

function writeState(state: BuilderState): void {
  writeStore(KEY, state);
  emitMockChange();
}

function getOrCreateThread(agentId: string): BuilderThread {
  const state = readState();
  if (!state.threads[agentId]) {
    state.threads[agentId] = {
      id: generateId("bthread"),
      agentId,
      messages: [],
    };
    writeState(state);
  }
  return state.threads[agentId];
}

function updateMessage(agentId: string, messageId: string, patch: Partial<BuilderMessage>): void {
  const state = readState();
  const thread = state.threads[agentId];
  if (!thread) return;
  const index = thread.messages.findIndex((m) => m.id === messageId);
  if (index === -1) return;
  thread.messages[index] = { ...thread.messages[index], ...patch };
  writeState(state);
}

function appendMessage(agentId: string, message: BuilderMessage): void {
  const state = readState();
  const thread = state.threads[agentId] ?? {
    id: generateId("bthread"),
    agentId,
    messages: [],
  };
  thread.messages.push(message);
  state.threads[agentId] = thread;
  writeState(state);
}

/** Derive an agent name from the first prompt (very naive on purpose). */
function deriveAgentName(prompt: string): string {
  const lower = prompt.toLowerCase();
  if (lower.includes("sales") || lower.includes("lead")) return "Sales Research Agent";
  if (lower.includes("research") || lower.includes("competitor")) return "Research Agent";
  if (lower.includes("support") || lower.includes("document")) return "Docs Q&A Agent";
  if (lower.includes("report") || lower.includes("notes")) return "Report Writer Agent";
  return "Custom Agent";
}

/**
 * Simulated build flow.
 *
 * Demo triggers (Phase 1 only): include the word "fail" in a prompt to see the
 * error + automatic repair state, or "warn" for the warning state.
 * TODO(phase-4): replace with real builder-agent SSE streaming.
 */
function runSimulatedBuild(agentId: string, prompt: string): void {
  const isError = /\bfail\b/i.test(prompt);
  const isWarning = /\bwarn\b/i.test(prompt);

  setAgentStatus(agentId, "building");

  const steps: BuildStep[] = STEP_KEYS.map((labelKey, i) => ({
    labelKey,
    state: i === 0 ? "running" : "pending",
  }));

  const assistantId = generateId("bmsg");
  appendMessage(agentId, {
    id: assistantId,
    threadId: agentId,
    role: "assistant",
    content: "",
    steps,
    createdAt: nowIso(),
  });

  const STEP_MS = 1100;

  STEP_KEYS.forEach((_, i) => {
    setTimeout(() => {
      const next: BuildStep[] = STEP_KEYS.map((labelKey, j) => ({
        labelKey,
        state:
          j < i + 1 ? "done" : j === i + 1 ? "running" : "pending",
      }));
      // Last step fails in the error scenario.
      if (isError && i === STEP_KEYS.length - 1) {
        next[next.length - 1] = { labelKey: STEP_KEYS[STEP_KEYS.length - 1], state: "failed" };
      }
      updateMessage(agentId, assistantId, { steps: next });
    }, STEP_MS * (i + 1));
  });

  setTimeout(() => {
    const name = deriveAgentName(prompt);

    if (isError) {
      setAgentStatus(agentId, "needs_attention");
      updateMessage(agentId, assistantId, {
        content: "builder:mock.errorResponse",
        tone: "error",
        actions: ["fix_automatically", "view_structure"],
      });
      return;
    }

    upsertAgentSpec(agentId, makeSpecForPrompt(name, prompt));

    if (isWarning) {
      setAgentStatus(agentId, "needs_attention");
      updateMessage(agentId, assistantId, {
        content: "builder:mock.warningResponse",
        tone: "warning",
        actions: ["test_agent", "view_structure", "fix_automatically"],
      });
      return;
    }

    setAgentStatus(agentId, "ready");
    updateMessage(agentId, assistantId, {
      content: "builder:mock.successResponse",
      tone: "success",
      actions: ["test_agent", "view_structure"],
    });
  }, STEP_MS * (STEP_KEYS.length + 1));
}

/** Simulated automatic repair (triggered by the "Fix automatically" action). */
export function runSimulatedRepair(agentId: string): void {
  setAgentStatus(agentId, "building");
  const assistantId = generateId("bmsg");
  appendMessage(agentId, {
    id: assistantId,
    threadId: agentId,
    role: "assistant",
    content: "builder:mock.repairInProgress",
    steps: [{ labelKey: "repairing", state: "running" }],
    createdAt: nowIso(),
  });

  setTimeout(() => {
    setAgentStatus(agentId, "ready");
    upsertAgentSpec(agentId, makeSpecForPrompt("Repaired Agent", "Repaired configuration"));
    updateMessage(agentId, assistantId, {
      content: "builder:mock.repairResponse",
      tone: "success",
      steps: [{ labelKey: "repairing", state: "done" }],
      actions: ["test_agent", "view_structure"],
    });
  }, 2600);
}

export class MockBuilderRepository implements BuilderRepository {
  async getThread(agentId: string): Promise<BuilderThread> {
    return getOrCreateThread(agentId);
  }

  async sendMessage(agentId: string, content: string): Promise<void> {
    appendMessage(agentId, {
      id: generateId("bmsg"),
      threadId: agentId,
      role: "user",
      content,
      createdAt: nowIso(),
    });
    runSimulatedBuild(agentId, content);
  }
}
