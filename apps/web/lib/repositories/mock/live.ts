import type { LiveMessage, LiveThread } from "@/lib/domain/types";
import type { LiveRepository } from "@/lib/repositories/interfaces";

import { emitMockChange } from "./events";
import { generateId, nowIso, readStore, writeStore } from "./storage";

interface LiveState {
  threads: Record<string, LiveThread>;
}

const KEY = "live";

const STATUS_SEQUENCE = ["searching", "reading", "analyzing", "preparing"];

function readState(): LiveState {
  return readStore<LiveState>(KEY, { threads: {} });
}

function writeState(state: LiveState): void {
  writeStore(KEY, state);
  emitMockChange();
}

function getOrCreateThread(agentId: string): LiveThread {
  const state = readState();
  if (!state.threads[agentId]) {
    state.threads[agentId] = { id: generateId("lthread"), agentId, messages: [] };
    writeState(state);
  }
  return state.threads[agentId];
}

function appendMessage(agentId: string, message: LiveMessage): void {
  const state = readState();
  const thread = state.threads[agentId] ?? {
    id: generateId("lthread"),
    agentId,
    messages: [],
  };
  thread.messages.push(message);
  state.threads[agentId] = thread;
  writeState(state);
}

function updateMessage(agentId: string, messageId: string, patch: Partial<LiveMessage>): void {
  const state = readState();
  const thread = state.threads[agentId];
  if (!thread) return;
  const index = thread.messages.findIndex((m) => m.id === messageId);
  if (index === -1) return;
  thread.messages[index] = { ...thread.messages[index], ...patch };
  writeState(state);
}

/** Realistic mock output: markdown, a table and citations. */
function buildMockAnswer(prompt: string): Pick<LiveMessage, "content" | "citations" | "artifacts"> {
  const content = [
    `Here is what I found based on your request:`,
    ``,
    `## Summary`,
    ``,
    `- I analyzed the request: "${prompt.slice(0, 140)}"`,
    `- I gathered the most relevant public information available.`,
    `- Confidence is **high** on the overview and **medium** on recent changes.`,
    ``,
    `## Key findings`,
    ``,
    `| Area | Finding | Confidence |`,
    `| --- | --- | --- |`,
    `| Overview | Consistent positioning across public sources | High |`,
    `| Activity | Two notable updates in the last 30 days | Medium |`,
    `| Risks | No blocking issue identified | Medium |`,
    ``,
    `## Suggested next step`,
    ``,
    `Ask me to go deeper on any specific point, or to format this as a report.`,
  ].join("\n");

  return {
    content,
    citations: [
      { label: "example.com — company overview", url: "https://example.com" },
      { label: "example.com/news — latest updates", url: "https://example.com/news" },
    ],
    artifacts: [{ kind: "table", title: "Key findings" }],
  };
}

/**
 * Simulated live run: user-facing tool statuses, then a rich mock answer.
 * TODO(phase-5): replace with the real shared runtime + SSE run events.
 */
function runSimulatedResponse(agentId: string, prompt: string): void {
  const assistantId = generateId("lmsg");
  appendMessage(agentId, {
    id: assistantId,
    threadId: agentId,
    role: "assistant",
    content: "",
    pending: true,
    statusKey: STATUS_SEQUENCE[0],
    createdAt: nowIso(),
  });

  STATUS_SEQUENCE.forEach((statusKey, i) => {
    setTimeout(() => {
      updateMessage(agentId, assistantId, { statusKey });
    }, 900 * i);
  });

  setTimeout(() => {
    updateMessage(agentId, assistantId, {
      ...buildMockAnswer(prompt),
      pending: false,
      statusKey: undefined,
    });
  }, 900 * STATUS_SEQUENCE.length + 600);
}

export class MockLiveRepository implements LiveRepository {
  async getThread(agentId: string): Promise<LiveThread> {
    return getOrCreateThread(agentId);
  }

  async sendMessage(agentId: string, content: string): Promise<void> {
    appendMessage(agentId, {
      id: generateId("lmsg"),
      threadId: agentId,
      role: "user",
      content,
      createdAt: nowIso(),
    });
    runSimulatedResponse(agentId, content);
  }

  async clearThread(agentId: string): Promise<void> {
    const state = readState();
    delete state.threads[agentId];
    writeState(state);
  }
}
