import type { KnowledgeSource } from "@/lib/domain/types";
import type { KnowledgeRepository } from "@/lib/repositories/interfaces";

import { emitMockChange } from "./events";
import { generateId, nowIso, readStore, writeStore } from "./storage";

interface KnowledgeState {
  sources: KnowledgeSource[];
}

const KEY = "knowledge";

function readState(): KnowledgeState {
  return readStore<KnowledgeState>(KEY, {
    sources: [
      {
        id: "src_docs",
        agentId: "agent_support",
        kind: "file",
        name: "product-documentation.pdf",
        status: "ready",
        createdAt: "2026-08-01T10:00:00.000Z",
      },
    ],
  });
}

function writeState(state: KnowledgeState): void {
  writeStore(KEY, state);
  emitMockChange();
}

export class MockKnowledgeRepository implements KnowledgeRepository {
  async listSources(agentId: string): Promise<KnowledgeSource[]> {
    return readState().sources.filter((s) => s.agentId === agentId);
  }

  async addSource(
    agentId: string,
    name: string,
    kind: KnowledgeSource["kind"],
  ): Promise<KnowledgeSource> {
    const state = readState();
    const source: KnowledgeSource = {
      id: generateId("src"),
      agentId,
      kind,
      name,
      status: "ready",
      createdAt: nowIso(),
    };
    state.sources.push(source);
    writeState(state);
    return source;
  }

  async removeSource(sourceId: string): Promise<void> {
    const state = readState();
    state.sources = state.sources.filter((s) => s.id !== sourceId);
    writeState(state);
  }
}
