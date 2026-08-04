import type { Agent, AgentSpec, AgentStatus, AgentVersion } from "@/lib/domain/types";
import type { AgentRepository } from "@/lib/repositories/interfaces";

import { emitMockChange } from "./events";
import { makeSpecForPrompt, SEED_AGENTS } from "./seed";
import { delay, generateId, nowIso, readStore, writeStore } from "./storage";

interface AgentsState {
  agents: Agent[];
  versions: AgentVersion[];
  seeded: boolean;
}

const KEY = "agents";

function readState(): AgentsState {
  const state = readStore<AgentsState>(KEY, { agents: [], versions: [], seeded: false });
  if (!state.seeded) {
    const seeded: AgentsState = {
      agents: SEED_AGENTS.map((s) => s.agent),
      versions: SEED_AGENTS.map((s) => s.version),
      seeded: true,
    };
    writeStore(KEY, seeded);
    return seeded;
  }
  return state;
}

function writeState(state: AgentsState): void {
  writeStore(KEY, state);
  emitMockChange();
}

export function setAgentStatus(agentId: string, status: AgentStatus): void {
  const state = readState();
  const agent = state.agents.find((a) => a.id === agentId);
  if (!agent) return;
  agent.status = status;
  agent.updatedAt = nowIso();
  writeState(state);
}

export function upsertAgentSpec(agentId: string, spec: AgentSpec): AgentVersion {
  const state = readState();
  const agent = state.agents.find((a) => a.id === agentId);
  const existing = state.versions.filter((v) => v.agentId === agentId);
  const versionNumber = existing.length > 0 ? Math.max(...existing.map((v) => v.versionNumber)) + 1 : 1;
  const version: AgentVersion = {
    id: generateId("ver"),
    agentId,
    versionNumber,
    spec,
    testStatus: "passed",
    createdAt: nowIso(),
  };
  state.versions.push(version);
  if (agent) {
    agent.draftVersionId = version.id;
    agent.name = spec.name;
    agent.updatedAt = nowIso();
  }
  writeState(state);
  return version;
}

export class MockAgentRepository implements AgentRepository {
  async listAgents(): Promise<Agent[]> {
    return readState().agents;
  }

  async getAgent(agentId: string): Promise<Agent | null> {
    return readState().agents.find((a) => a.id === agentId) ?? null;
  }

  async createAgent(name?: string): Promise<Agent> {
    await delay(250);
    const state = readState();
    const agent: Agent = {
      id: generateId("agent"),
      name: name ?? "",
      icon: "sparkles",
      status: "draft",
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    state.agents.unshift(agent);
    writeState(state);
    return agent;
  }

  async renameAgent(agentId: string, name: string): Promise<Agent> {
    const state = readState();
    const agent = state.agents.find((a) => a.id === agentId);
    if (!agent) throw new Error("agent_not_found");
    agent.name = name;
    agent.updatedAt = nowIso();
    writeState(state);
    return agent;
  }

  async duplicateAgent(agentId: string): Promise<Agent> {
    const state = readState();
    const source = state.agents.find((a) => a.id === agentId);
    if (!source) throw new Error("agent_not_found");
    const copy: Agent = {
      ...source,
      id: generateId("agent"),
      name: `${source.name} (copy)`,
      status: "draft",
      publishedVersionId: undefined,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    const sourceVersion = state.versions
      .filter((v) => v.agentId === agentId)
      .sort((a, b) => b.versionNumber - a.versionNumber)[0];
    if (sourceVersion) {
      const version: AgentVersion = {
        ...sourceVersion,
        id: generateId("ver"),
        agentId: copy.id,
        versionNumber: 1,
        createdAt: nowIso(),
      };
      copy.draftVersionId = version.id;
      state.versions.push(version);
    }
    state.agents.unshift(copy);
    writeState(state);
    return copy;
  }

  async deleteAgent(agentId: string): Promise<void> {
    const state = readState();
    state.agents = state.agents.filter((a) => a.id !== agentId);
    state.versions = state.versions.filter((v) => v.agentId !== agentId);
    writeState(state);
  }

  async publishAgent(agentId: string): Promise<Agent> {
    await delay(900);
    const state = readState();
    const agent = state.agents.find((a) => a.id === agentId);
    if (!agent) throw new Error("agent_not_found");
    agent.status = "published";
    agent.publishedVersionId = agent.draftVersionId;
    agent.updatedAt = nowIso();
    writeState(state);
    return agent;
  }

  async getCurrentVersion(agentId: string): Promise<AgentVersion | null> {
    const state = readState();
    return (
      state.versions
        .filter((v) => v.agentId === agentId)
        .sort((a, b) => b.versionNumber - a.versionNumber)[0] ?? null
    );
  }

  async getSpec(agentId: string): Promise<AgentSpec | null> {
    const version = await this.getCurrentVersion(agentId);
    return version?.spec ?? null;
  }
}

export { makeSpecForPrompt };
