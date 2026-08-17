import { describe, expect, it } from "vitest";

import { pickExactAppIcon, rankIntegrationApps } from "@/lib/integrations/rank-apps";

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

describe("pickExactAppIcon", () => {
  it("uses only the exact Pipedream app logo", () => {
    const src = pickExactAppIcon("google_maps_platform", [
      { appId: "google", name: "Google", imgSrc: "https://example.com/google.png" },
      {
        appId: "google_maps_platform",
        name: "Google Maps Platform",
        imgSrc: "https://assets.pipedream.net/s.v0/app_Xe3hyV/logo/orig",
      },
    ]);
    expect(src).toBe("https://assets.pipedream.net/s.v0/app_Xe3hyV/logo/orig");
  });

  it("does not invent a logo from a different app", () => {
    expect(
      pickExactAppIcon("google_maps_platform", [
        { appId: "gmail", name: "Gmail", imgSrc: "https://assets.pipedream.net/gmail.png" },
      ]),
    ).toBeUndefined();
  });
});
