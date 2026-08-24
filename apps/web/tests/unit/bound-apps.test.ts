/**
 * "Connected" means connected to *this* agent.
 *
 * `GET /agents/:id/connections` returns two things: the bindings this agent
 * has, and every Pipedream account the owner has connected anywhere. The
 * structure graph was reading the second list, so a brand-new agent with zero
 * bindings showed a green "Connecté" badge on every app while the service
 * refused to use any of them — option pickers came back empty and turned into
 * free-text boxes asking for raw ids, and starting the listener failed with
 * "check the connection and the event" on a screen that looked fine.
 *
 * The agent that worked end to end had five bindings; the one that could not
 * listen had none.
 */

import { describe, expect, it } from "vitest";

type Connection = {
  id: string;
  provider: string;
  status?: string;
  app_id?: string | null;
  provider_metadata?: { app_id?: string } | null;
};
type Binding = { connection_id: string; enabled: boolean };

/** Mirrors `boundAppIds` in agent-ia-view.tsx. */
function boundAppIds(data: { connections: Connection[]; bindings: Binding[] }): Set<string> {
  const boundConnectionIds = new Set(
    data.bindings.filter((b) => b.enabled).map((b) => String(b.connection_id)),
  );
  const apps = new Set<string>();
  for (const connection of data.connections) {
    const status = (connection.status || "active").toLowerCase();
    if (!(status === "active" || status === "connected" || status === "ok")) continue;
    if (!boundConnectionIds.has(String(connection.id))) continue;
    if (connection.provider === "google") {
      apps.add("google");
      continue;
    }
    const appId = connection.app_id || connection.provider_metadata?.app_id || null;
    if (appId) apps.add(String(appId).toLowerCase());
  }
  return apps;
}

/** The owner's seven Pipedream accounts, as the endpoint returns them. */
const OWNER_ACCOUNTS: Connection[] = [
  { id: "c-airtable", provider: "pipedream", status: "active", provider_metadata: { app_id: "airtable_oauth" } },
  { id: "c-discord", provider: "pipedream", status: "active", provider_metadata: { app_id: "discord" } },
  { id: "c-gmail", provider: "pipedream", status: "active", provider_metadata: { app_id: "gmail" } },
  { id: "c-notion", provider: "pipedream", status: "active", provider_metadata: { app_id: "notion" } },
  { id: "c-openai", provider: "pipedream", status: "active", provider_metadata: { app_id: "openai" } },
  { id: "c-slack", provider: "pipedream", status: "active", provider_metadata: { app_id: "slack_v2" } },
  { id: "c-trello", provider: "pipedream", status: "active", provider_metadata: { app_id: "trello" } },
];

describe("an agent with no bindings", () => {
  const apps = boundAppIds({ connections: OWNER_ACCOUNTS, bindings: [] });

  it("counts nothing as connected", () => {
    expect(apps.size).toBe(0);
  });

  it("does not claim Trello just because the owner linked it elsewhere", () => {
    expect(apps.has("trello")).toBe(false);
  });
});

describe("an agent with its own bindings", () => {
  const apps = boundAppIds({
    connections: OWNER_ACCOUNTS,
    bindings: [
      { connection_id: "c-trello", enabled: true },
      { connection_id: "c-airtable", enabled: true },
      { connection_id: "c-slack", enabled: true },
    ],
  });

  it("counts exactly the apps it is bound to", () => {
    expect([...apps].sort()).toEqual(["airtable_oauth", "slack_v2", "trello"]);
  });

  it("still leaves the owner's other accounts out", () => {
    expect(apps.has("gmail")).toBe(false);
    expect(apps.has("notion")).toBe(false);
  });
});

describe("the edges", () => {
  it("ignores a binding the user disabled", () => {
    const apps = boundAppIds({
      connections: OWNER_ACCOUNTS,
      bindings: [{ connection_id: "c-trello", enabled: false }],
    });
    expect(apps.size).toBe(0);
  });

  it("ignores a bound account that is no longer active", () => {
    const apps = boundAppIds({
      connections: [{ ...OWNER_ACCOUNTS[6], status: "revoked" }],
      bindings: [{ connection_id: "c-trello", enabled: true }],
    });
    expect(apps.size).toBe(0);
  });

  it("keeps Google at the suite level when it is bound", () => {
    const apps = boundAppIds({
      connections: [{ id: "c-g", provider: "google", status: "active" }],
      bindings: [{ connection_id: "c-g", enabled: true }],
    });
    expect([...apps]).toEqual(["google"]);
  });

  it("survives a binding pointing at an account that is gone", () => {
    const apps = boundAppIds({
      connections: OWNER_ACCOUNTS,
      bindings: [{ connection_id: "c-vanished", enabled: true }],
    });
    expect(apps.size).toBe(0);
  });
});
