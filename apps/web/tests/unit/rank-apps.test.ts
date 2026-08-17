import { describe, expect, it } from "vitest";

import { rankIntegrationApps } from "@/lib/integrations/rank-apps";

describe("rankIntegrationApps", () => {
  it("puts Gmail above the Google suite when the query is gmail", () => {
    const ranked = rankIntegrationApps("gmail", [
      { appId: "google", name: "Google", summary: "Gmail and Google Calendar tools." },
      { appId: "google_calendar", name: "Google Calendar" },
      { appId: "gmail", name: "Gmail" },
      { appId: "google_drive", name: "Google Drive" },
    ]);
    expect(ranked[0]?.appId).toBe("gmail");
    expect(ranked.map((a) => a.appId)).not.toContain("google");
  });
});
