/**
 * The setup card speaks to the reader, one line per app.
 *
 * It used to print the readiness checks verbatim in English and then one line
 * per bound action: "Configure pd:airtable_oauth-update-record: baseId,
 * tableId, recordId". Eight Airtable actions meant eight near-identical lines
 * naming our plumbing, and none of them said what to do.
 */

import { describe, expect, it } from "vitest";

import { appDisplayName, appKeyFromToolId, formatList } from "@/lib/integrations/app-name";
import { resolvePropCopy } from "@/lib/integrations/prop-labels";

type MissingConfig = { tool_id?: unknown; fields?: unknown };

/** Mirrors the grouping in agent-ia-view.tsx's `setupMissing`. */
function groupByApp(missing: MissingConfig[]): Map<string, Set<string>> {
  const byApp = new Map<string, Set<string>>();
  for (const m of missing) {
    if (typeof m.tool_id !== "string") continue;
    const app = appDisplayName(appKeyFromToolId(m.tool_id)) || m.tool_id;
    const fields = Array.isArray(m.fields) ? m.fields : [];
    const bucket = byApp.get(app) ?? new Set<string>();
    for (const f of fields) {
      if (typeof f === "string" && f.trim()) bucket.add(f.trim());
    }
    byApp.set(app, bucket);
  }
  return byApp;
}

describe("appKeyFromToolId", () => {
  it("reads the app out of a Pipedream tool id", () => {
    expect(appKeyFromToolId("pd:airtable_oauth-update-record")).toBe("airtable_oauth");
    expect(appKeyFromToolId("pd:slack_v2-send-message-to-channel")).toBe("slack_v2");
    expect(appKeyFromToolId("pd:trello-update-card")).toBe("trello");
  });

  it("copes with a bare id and with nothing at all", () => {
    expect(appKeyFromToolId("airtable_oauth")).toBe("airtable_oauth");
    expect(appKeyFromToolId("")).toBe("");
    expect(appKeyFromToolId(null)).toBe("");
  });
});

describe("the setup card lines", () => {
  const EIGHT_AIRTABLE_ACTIONS: MissingConfig[] = [
    { tool_id: "pd:airtable_oauth-update-table", fields: ["baseId"] },
    { tool_id: "pd:airtable_oauth-update-record", fields: ["baseId", "tableId"] },
    { tool_id: "pd:airtable_oauth-update-field", fields: ["baseId", "tableId"] },
    { tool_id: "pd:airtable_oauth-update-comment", fields: ["baseId", "tableId"] },
    { tool_id: "pd:airtable_oauth-delete-record", fields: ["baseId", "tableId"] },
    { tool_id: "pd:airtable_oauth-create-table", fields: ["baseId"] },
    { tool_id: "pd:airtable_oauth-search-records", fields: ["baseId", "tableId"] },
    { tool_id: "pd:airtable_oauth-list-tables", fields: ["baseId"] },
  ];

  it("collapses eight actions of one app into a single line", () => {
    const byApp = groupByApp(EIGHT_AIRTABLE_ACTIONS);
    expect([...byApp.keys()]).toEqual(["Airtable"]);
  });

  it("keeps the union of the settings, without repeats", () => {
    const byApp = groupByApp(EIGHT_AIRTABLE_ACTIONS);
    expect([...(byApp.get("Airtable") ?? [])].sort()).toEqual(["baseId", "tableId"]);
  });

  it("names the app the way a person would, not the slug", () => {
    const byApp = groupByApp([{ tool_id: "pd:airtable_oauth-update-record", fields: [] }]);
    expect([...byApp.keys()]).toEqual(["Airtable"]);
    expect([...byApp.keys()][0]).not.toContain("Oauth");
    expect([...byApp.keys()][0]).not.toContain("pd:");
  });

  it("keeps separate apps on separate lines", () => {
    const byApp = groupByApp([
      { tool_id: "pd:airtable_oauth-update-record", fields: ["baseId"] },
      { tool_id: "pd:trello-update-card", fields: ["board"] },
      { tool_id: "pd:slack_v2-send-message", fields: ["conversation"] },
    ]);
    expect([...byApp.keys()].sort()).toEqual(["Airtable", "Slack", "Trello"]);
  });

  it("labels the settings in words, not camelCase keys", () => {
    const labels = ["baseId", "tableId"].map((f) => resolvePropCopy(f).label.toLowerCase());
    for (const label of labels) {
      expect(label).not.toMatch(/[A-Z]/);
      expect(label).not.toContain("id");
    }
  });
});

describe("formatList", () => {
  it("joins the French way", () => {
    expect(formatList(["la base", "la table"], "fr")).toBe("la base et la table");
  });

  it("joins the English way", () => {
    expect(formatList(["the base", "the table"], "en")).toBe("the base and the table");
  });

  it("leaves a single item alone", () => {
    expect(formatList(["le tableau"], "fr")).toBe("le tableau");
  });

  it("says nothing for nothing", () => {
    expect(formatList([], "fr")).toBe("");
  });
});
