import { describe, expect, it } from "vitest";

import { safeNextPath } from "@/lib/auth/post-auth";

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
