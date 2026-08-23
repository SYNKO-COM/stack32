import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * A preproduction deployment is its own Vercel project, so VERCEL_ENV is
 * "production" there too. The billing guard therefore fired on every server
 * action that touched billing, and the Build page answered 503 with nothing
 * shown in the UI — the message was only visible in Vercel's runtime logs.
 *
 * The guard is right to exist: mock billing must never reach real production.
 * It just needs to be able to tell the two environments apart.
 */
async function loadEnv() {
  vi.resetModules();
  return import("@/lib/env.server");
}

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

describe("server env guard", () => {
  it("still refuses mock billing in real production", async () => {
    process.env.VERCEL_ENV = "production";
    process.env.BILLING_MODE = "mock";
    delete process.env.STACK32_ENV;
    const { getServerEnv } = await loadEnv();
    expect(() => getServerEnv()).toThrow(/BILLING_MODE must be "whop"/);
  });

  it("allows mock billing when the deployment declares itself preproduction", async () => {
    process.env.VERCEL_ENV = "production";
    process.env.STACK32_ENV = "preproduction";
    process.env.BILLING_MODE = "mock";
    const { getServerEnv } = await loadEnv();
    expect(getServerEnv().BILLING_MODE).toBe("mock");
  });

  it("still refuses mock AI in real production", async () => {
    process.env.VERCEL_ENV = "production";
    process.env.BILLING_MODE = "whop";
    process.env.AI_EXECUTION_MODE = "mock";
    delete process.env.STACK32_ENV;
    const { getServerEnv } = await loadEnv();
    expect(() => getServerEnv()).toThrow(/AI_EXECUTION_MODE=mock/);
  });

  it("does not treat an unrelated STACK32_ENV value as an escape hatch", async () => {
    process.env.VERCEL_ENV = "production";
    process.env.STACK32_ENV = "staging-ish";
    process.env.BILLING_MODE = "mock";
    const { getServerEnv } = await loadEnv();
    expect(() => getServerEnv()).toThrow(/BILLING_MODE must be "whop"/);
  });

  it("leaves local development untouched", async () => {
    delete process.env.VERCEL_ENV;
    delete process.env.ENVIRONMENT;
    delete process.env.STACK32_ENV;
    process.env.BILLING_MODE = "mock";
    const { getServerEnv } = await loadEnv();
    expect(getServerEnv().BILLING_MODE).toBe("mock");
  });
});
