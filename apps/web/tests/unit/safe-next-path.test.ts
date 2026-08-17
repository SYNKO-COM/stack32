import { describe, expect, it } from "vitest";

import {
  isCheckoutNext,
  onboardingPathForNext,
  postOnboardingPath,
  safeNextPath,
} from "@/lib/auth/post-auth";

describe("safeNextPath", () => {
  it("allows same-origin relative paths", () => {
    expect(safeNextPath("/agents")).toBe("/agents");
    expect(safeNextPath("/@ada/research-agent")).toBe("/@ada/research-agent");
    expect(safeNextPath("/my-agents?tab=favorites")).toBe("/my-agents?tab=favorites");
    expect(safeNextPath("/p/ada/agent#chat")).toBe("/p/ada/agent#chat");
  });

  it("rejects protocol-relative and absolute URLs", () => {
    expect(safeNextPath("//evil.com")).toBeNull();
    expect(safeNextPath("https://evil.com")).toBeNull();
    expect(safeNextPath("http://evil.com/path")).toBeNull();
    expect(safeNextPath("/\\evil.com")).toBeNull();
  });

  it("rejects javascript and data schemes", () => {
    expect(safeNextPath("javascript:alert(1)")).toBeNull();
    expect(safeNextPath("/javascript:alert(1)")).toBeNull();
    expect(safeNextPath("data:text/html,hi")).toBeNull();
  });

  it("rejects encoded open-redirect tricks", () => {
    expect(safeNextPath("%2f%2fevil.com")).toBeNull();
    expect(safeNextPath("/%2f%2fevil.com")).toBeNull();
    expect(safeNextPath("/%5c%5cevil.com")).toBeNull();
    expect(safeNextPath("/agents%00")).toBeNull();
  });

  it("rejects blank, oversized, and non-path values", () => {
    expect(safeNextPath(null)).toBeNull();
    expect(safeNextPath("")).toBeNull();
    expect(safeNextPath("   ")).toBeNull();
    expect(safeNextPath("agents")).toBeNull();
    expect(safeNextPath(`/${"a".repeat(600)}`)).toBeNull();
  });
});

describe("post-onboarding destinations", () => {
  it("treats only checkout as a paywall bypass", () => {
    expect(isCheckoutNext("/billing/checkout?plan=pro")).toBe(true);
    expect(isCheckoutNext("/billing/checkout")).toBe(true);
    expect(isCheckoutNext("/agents")).toBe(false);
    expect(isCheckoutNext("/billing/plans")).toBe(false);
    expect(isCheckoutNext(null)).toBe(false);
  });

  it("sends new users to onboarding without an /agents next", () => {
    expect(onboardingPathForNext("/agents")).toBe("/onboarding");
    expect(onboardingPathForNext(null)).toBe("/onboarding");
    expect(onboardingPathForNext("/billing/checkout?plan=starter&interval=monthly")).toBe(
      "/onboarding?next=%2Fbilling%2Fcheckout%3Fplan%3Dstarter%26interval%3Dmonthly",
    );
  });

  it("shows the plan picker after onboarding unless a checkout was chosen", () => {
    expect(postOnboardingPath(null)).toBe("/billing/plans");
    expect(postOnboardingPath("/agents")).toBe("/billing/plans");
    expect(postOnboardingPath("/billing/checkout?plan=pro")).toBe(
      "/billing/checkout?plan=pro",
    );
  });
});
