import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("getServerEnv production fail-closed", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.VERCEL_ENV;
    delete process.env.ENVIRONMENT;
    delete process.env.BILLING_MODE;
    delete process.env.AI_EXECUTION_MODE;
  });

  it("allows mock billing outside production", async () => {
    process.env.BILLING_MODE = "mock";
    const { getBillingMode } = await import("@/lib/env.server");
    expect(getBillingMode()).toBe("mock");
  });

  it("rejects mock billing when VERCEL_ENV=production", async () => {
    process.env.VERCEL_ENV = "production";
    process.env.BILLING_MODE = "mock";
    const { getBillingMode } = await import("@/lib/env.server");
    expect(() => getBillingMode()).toThrow(/BILLING_MODE must be "whop"/);
  });

  it("accepts whop billing in production", async () => {
    process.env.VERCEL_ENV = "production";
    process.env.BILLING_MODE = "whop";
    process.env.AI_EXECUTION_MODE = "agent-service";
    const { getBillingMode } = await import("@/lib/env.server");
    expect(getBillingMode()).toBe("whop");
  });
});
