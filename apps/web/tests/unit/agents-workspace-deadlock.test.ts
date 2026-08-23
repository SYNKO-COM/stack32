import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * A user with no workspace was stuck on an endless spinner with no error and
 * no way out. Two gates formed a cycle:
 *
 *   /agents waits for `agents`
 *     -> useAgents is disabled until a workspace exists
 *       -> the first workspace is only created by create_agent_workspace
 *         -> which /agents refused to call without a workspace
 *
 * Reproduced on a freshly provisioned account, fixed by letting both the page
 * and the query proceed with a null workspace. These assert the cycle stays
 * broken; the behaviour is hard to cover without a full browser.
 */
const webRoot = path.resolve(__dirname, "../..");
const read = (p: string) => fs.readFileSync(path.join(webRoot, p), "utf8");

describe("agents page / workspace bootstrap", () => {
  it("does not gate the agents query on having a workspace", () => {
    const hook = read("hooks/use-agents.ts");
    const useAgents = hook.slice(hook.indexOf("export function useAgents"));
    const body = useAgents.slice(0, useAgents.indexOf("export function useAgent("));
    expect(body).not.toMatch(/enabled:\s*workspaceId\s*!==\s*null/);
  });

  it("does not block the page render on having a workspace", () => {
    const page = read("app/agents/page.tsx");
    expect(page).not.toMatch(/if \(isLoading \|\| !agents \|\| !activeWorkspaceId\)/);
    expect(page).toMatch(/workspacesLoading/);
  });

  it("lets agent creation proceed without one so the RPC can create it", () => {
    const page = read("app/agents/page.tsx");
    expect(page).toMatch(/workspaceId: activeWorkspaceId \?\? undefined/);
    expect(page).not.toMatch(/mutateAsync\(\{ workspaceId: activeWorkspaceId \}\)/);
  });

  it("still waits for the workspace list before deciding", () => {
    const page = read("app/agents/page.tsx");
    expect(page).toMatch(/isLoading: workspacesLoading/);
  });
});
