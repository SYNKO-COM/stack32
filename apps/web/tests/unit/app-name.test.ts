/**
 * A drawer said "Airtable Oauth". Pipedream writes the auth flavour into the
 * slug — `airtable_oauth`, `slack_bot`, `notion_api_key` — and title-casing it
 * put our plumbing on a screen meant for someone who has never heard of OAuth.
 */

import { describe, expect, it } from "vitest";

import { appDisplayName } from "@/lib/integrations/app-name";

describe("appDisplayName", () => {
  it("drops the auth flavour Pipedream writes into the slug", () => {
    expect(appDisplayName("airtable_oauth")).toBe("Airtable");
    expect(appDisplayName("notion_api_key")).toBe("Notion");
    expect(appDisplayName("slack_bot")).toBe("Slack");
    expect(appDisplayName("trello_oauth2")).toBe("Trello");
  });

  it("drops a version marker the same way", () => {
    expect(appDisplayName("slack_v2")).toBe("Slack");
    expect(appDisplayName("shopify_v3")).toBe("Shopify");
  });

  it("peels more than one marker", () => {
    expect(appDisplayName("acme_api_key_v2")).toBe("Acme");
  });

  it("spells the names title-casing would get wrong", () => {
    expect(appDisplayName("github")).toBe("GitHub");
    expect(appDisplayName("hubspot")).toBe("HubSpot");
    expect(appDisplayName("x_ai")).toBe("xAI");
    expect(appDisplayName("google_sheets")).toBe("Google Sheets");
  });

  it("title-cases an app nobody has curated", () => {
    expect(appDisplayName("monday_com")).toBe("Monday Com");
    expect(appDisplayName("zoho-crm")).toBe("Zoho Crm");
  });

  it("ignores the pd: prefix a tool id may carry", () => {
    expect(appDisplayName("pd:airtable_oauth")).toBe("Airtable");
  });

  it("never strips the app away entirely", () => {
    // `api` is the whole name here, not a suffix on something else.
    expect(appDisplayName("api")).toBe("Api");
    expect(appDisplayName("bot")).toBe("Bot");
  });

  it("says nothing when given nothing", () => {
    expect(appDisplayName("")).toBe("");
    expect(appDisplayName(null)).toBe("");
    expect(appDisplayName(undefined)).toBe("");
  });
});
