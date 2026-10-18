import { describe, expect, it, vi } from "vitest";
import { resolveWhopMembership } from "@/lib/billing/whop-membership-payload";

describe("Whop membership resolution", () => {
  it("resolves a payment to its membership and retains checkout metadata", async () => {
    const retrieve = vi.fn().mockResolvedValue({ id: "mem_123", status: "active" });
    const value = await resolveWhopMembership({ id: "pay_123", membership_id: "mem_123", metadata: { stack32_user_id: "alice" } }, retrieve);
    expect(retrieve).toHaveBeenCalledWith("mem_123");
    expect(value).toMatchObject({ id: "mem_123", metadata: { stack32_user_id: "alice" } });
  });
  it("preserves existing full membership events", async () => {
    const retrieve = vi.fn();
    const membership = { id: "mem_old", metadata: { stack32_user_id: "alice" } };
    expect(await resolveWhopMembership(membership, retrieve)).toEqual(membership);
    expect(retrieve).not.toHaveBeenCalled();
  });
  it("uses nested memberships without losing their owner", async () => {
    const retrieve = vi.fn().mockResolvedValue({ id: "mem_123", metadata: { stack32_user_id: "alice" } });
    expect(await resolveWhopMembership({ id: "pay_123", membership: "mem_123", metadata: { stack32_user_id: "other" } }, retrieve))
      .toMatchObject({ id: "mem_123", metadata: { stack32_user_id: "alice" } });
  });
  it("fails for retry when a membership is absent or cannot be fetched", async () => {
    await expect(resolveWhopMembership({ id: "pay_123" }, vi.fn())).rejects.toThrow("whop_membership_id_missing");
    await expect(resolveWhopMembership({ membership_id: "mem_123" }, vi.fn().mockRejectedValue(new Error("offline")))).rejects.toThrow("offline");
  });
});
