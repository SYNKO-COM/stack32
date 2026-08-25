import { describe, expect, it } from "vitest";

/**
 * Settings for a connected app are meaningless before the account exists:
 * Pipedream cannot list someone's calendars without one, so every picker
 * rendered as a bare text box asking for an id. They stay hidden until the
 * account is linked — but hiding must never swallow a panel that simply
 * failed to load, and native tools have no account to wait for.
 */
function shouldHideSettings({
  appId,
  accountCount,
  error,
}: {
  appId?: string;
  accountCount: number;
  error: string | null;
}) {
  const needsAccount = Boolean(appId);
  return needsAccount && accountCount === 0 && !error;
}

/**
 * The pickers only fill once a connection is bound to this agent. Right after
 * a fresh connect there is exactly one account and nothing bound, so binding
 * it is unambiguous. With several accounts the person chooses.
 */
function accountToAutoBind({
  storedConnectionId,
  accountIds,
}: {
  storedConnectionId: string;
  accountIds: string[];
}) {
  if (storedConnectionId) return null;
  return accountIds.length === 1 ? accountIds[0] : null;
}

describe("settings stay hidden until the account is there", () => {
  it("hides them for a connected app with no account yet", () => {
    expect(shouldHideSettings({ appId: "google_calendar", accountCount: 0, error: null })).toBe(true);
  });

  it("shows them the moment an account exists", () => {
    expect(shouldHideSettings({ appId: "google_calendar", accountCount: 1, error: null })).toBe(false);
  });

  it("never hides a native tool, which has no account to wait for", () => {
    expect(shouldHideSettings({ appId: undefined, accountCount: 0, error: null })).toBe(false);
  });

  it("never hides a panel whose load failed — that would look broken", () => {
    expect(
      shouldHideSettings({ appId: "google_calendar", accountCount: 0, error: "load failed" }),
    ).toBe(false);
  });
});

describe("the freshly connected account binds itself", () => {
  it("binds the single account so the pickers arrive filled", () => {
    expect(accountToAutoBind({ storedConnectionId: "", accountIds: ["c1"] })).toBe("c1");
  });

  it("leaves the choice alone when several accounts exist", () => {
    expect(accountToAutoBind({ storedConnectionId: "", accountIds: ["c1", "c2"] })).toBeNull();
  });

  it("never overrides an account already bound", () => {
    expect(accountToAutoBind({ storedConnectionId: "c9", accountIds: ["c1"] })).toBeNull();
  });

  it("does nothing when no account exists", () => {
    expect(accountToAutoBind({ storedConnectionId: "", accountIds: [] })).toBeNull();
  });
});
