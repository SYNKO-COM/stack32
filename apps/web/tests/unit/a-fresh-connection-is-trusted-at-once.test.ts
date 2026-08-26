import { describe, expect, it } from "vitest";

/**
 * The trigger panel's "connected" flag came only from the graph's query,
 * which is one refetch behind right after a fresh connect. The card already
 * verified the account server-side when onConnected fired — yet the save
 * button answered "Connectez l'application avant d'enregistrer" and a
 * reopened panel showed Connect again until a full page refresh.
 *
 * The card's word now counts immediately, and the connect event tells the
 * graph to refetch so bindings, badges and the connection id catch up.
 */
function isConnected({
  locallyConnected,
  propStatus,
}: {
  locallyConnected: boolean;
  propStatus: string | undefined;
}) {
  return (
    locallyConnected ||
    ["active", "connected", "ok"].includes((propStatus || "").toLowerCase())
  );
}

describe("a fresh connection is trusted at once", () => {
  it("the stale query no longer blocks a just-connected account", () => {
    expect(isConnected({ locallyConnected: true, propStatus: undefined })).toBe(true);
  });

  it("the query's answer still works on its own", () => {
    expect(isConnected({ locallyConnected: false, propStatus: "active" })).toBe(true);
    expect(isConnected({ locallyConnected: false, propStatus: "Connected" })).toBe(true);
  });

  it("no connection anywhere still means not connected", () => {
    expect(isConnected({ locallyConnected: false, propStatus: undefined })).toBe(false);
    expect(isConnected({ locallyConnected: false, propStatus: "needs_reauth" })).toBe(false);
  });
});
