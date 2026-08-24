/**
 * The old /structure link must be answered at the edge, not by a page.
 *
 * Structure was merged into the "Agent IA" tab. The redirect used to live in a
 * server page, which meant a full load of /structure still mounted the whole
 * agent workspace client tree around a child that immediately redirected — and
 * that combination crashed with React error #310 (a hook count changing between
 * renders), leaving the browser on a blank "This page couldn't load" screen
 * while /agent itself rendered perfectly.
 */

import { describe, expect, it } from "vitest";

import nextConfig from "../../next.config";

describe("the structure route", () => {
  it("is redirected by the config rather than by a page", async () => {
    const redirects = await nextConfig.redirects?.();
    const rule = redirects?.find((r) => r.source.includes("structure"));

    expect(rule).toBeDefined();
    expect(rule?.source).toBe("/agents/:agentId/structure");
    expect(rule?.destination).toBe("/agents/:agentId/agent");
    expect(rule?.permanent).toBe(true);
  });

  it("keeps the agent id it was given", async () => {
    const redirects = await nextConfig.redirects?.();
    const rule = redirects?.find((r) => r.source.includes("structure"));
    const param = "/:agentId";

    // Both sides carry the same placeholder, so /agents/abc/structure lands on
    // /agents/abc/agent rather than on somebody else's agent.
    expect(rule?.source).toContain(param);
    expect(rule?.destination).toContain(param);
  });
});
