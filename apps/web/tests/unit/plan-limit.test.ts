import { describe, expect, it } from "vitest";

import {
  isPlanLimitError,
  PlanLimitError,
  planLimitCodeFromUnknown,
} from "@/lib/billing/plan-limit";

describe("planLimitCodeFromUnknown", () => {
  it("detects PostgREST plan_agent_limit messages", () => {
    expect(planLimitCodeFromUnknown({ message: "plan_agent_limit", code: "P0001" })).toBe(
      "PLAN_AGENT_LIMIT",
    );
    expect(isPlanLimitError(new Error("plan_agent_limit"))).toBe(true);
  });

  it("detects workspace and publish gates", () => {
    expect(planLimitCodeFromUnknown(new Error("WORKSPACE_LIMIT_REACHED"))).toBe(
      "WORKSPACE_LIMIT_REACHED",
    );
    expect(planLimitCodeFromUnknown(new PlanLimitError("PLAN_PUBLISH_REQUIRED"))).toBe(
      "PLAN_PUBLISH_REQUIRED",
    );
  });

  it("ignores unrelated errors", () => {
    expect(planLimitCodeFromUnknown(new Error("duplicate_failed"))).toBeNull();
    expect(isPlanLimitError(null)).toBe(false);
  });
});
