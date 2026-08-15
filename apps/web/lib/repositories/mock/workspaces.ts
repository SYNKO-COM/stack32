import type { Workspace } from "@/lib/domain/types";
import type { WorkspaceRepository } from "@/lib/repositories/interfaces";

import { emitMockChange } from "./events";
import { delay, generateId, nowIso, readStore, writeStore } from "./storage";

interface WorkspacesState {
  workspaces: Workspace[];
}

const KEY = "workspaces";
export const DEFAULT_MOCK_WORKSPACE_ID = "ws_default";

function readState(): WorkspacesState {
  const state = readStore<WorkspacesState>(KEY, { workspaces: [] });
  if (state.workspaces.length === 0) {
    const seeded: WorkspacesState = {
      workspaces: [
        {
          id: DEFAULT_MOCK_WORKSPACE_ID,
          userId: "user_mock",
          name: "My workspace",
          createdAt: nowIso(),
          updatedAt: nowIso(),
        },
      ],
    };
    writeStore(KEY, seeded);
    return seeded;
  }
  return state;
}

function writeState(state: WorkspacesState): void {
  writeStore(KEY, state);
  emitMockChange();
}

export class MockWorkspaceRepository implements WorkspaceRepository {
  async listWorkspaces(): Promise<Workspace[]> {
    return readState().workspaces;
  }

  async getWorkspace(workspaceId: string): Promise<Workspace | null> {
    return readState().workspaces.find((w) => w.id === workspaceId) ?? null;
  }

  async createWorkspace(name: string): Promise<Workspace> {
    await delay(250);
    const state = readState();
    const workspace: Workspace = {
      id: generateId("ws"),
      userId: "user_mock",
      name: name.trim() || "My workspace",
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    state.workspaces.unshift(workspace);
    writeState(state);
    return workspace;
  }

  async renameWorkspace(workspaceId: string, name: string): Promise<Workspace> {
    const state = readState();
    const workspace = state.workspaces.find((w) => w.id === workspaceId);
    if (!workspace) throw new Error("workspace_not_found");
    workspace.name = name.trim();
    workspace.updatedAt = nowIso();
    writeState(state);
    return workspace;
  }
}
