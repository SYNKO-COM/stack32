import { describe, expect, it } from "vitest";

import nextConfig from "@/next.config";

/**
 * Production incident: `Permissions-Policy: microphone=()` disabled the mic for
 * every origin including our own, so the composer's getUserMedia call failed
 * before Chrome ever prompted. The UI then showed "allow it in your browser
 * settings", which could never work — the block came from this header.
 */
async function permissionsPolicy(): Promise<string> {
  const headers = await (nextConfig as { headers: () => Promise<
    { source: string; headers: { key: string; value: string }[] }[]
  > }).headers();
  const all = headers.flatMap((entry) => entry.headers);
  const found = all.find((h) => h.key.toLowerCase() === "permissions-policy");
  expect(found, "Permissions-Policy header must be set").toBeDefined();
  return found!.value;
}

describe("Permissions-Policy", () => {
  it("allows the microphone for our own origin so voice dictation works", async () => {
    const value = await permissionsPolicy();
    expect(value).toContain("microphone=(self)");
    expect(value).not.toContain("microphone=()");
  });

  it("still denies camera, geolocation and payment", async () => {
    const value = await permissionsPolicy();
    expect(value).toContain("camera=()");
    expect(value).toContain("geolocation=()");
    expect(value).toContain("payment=()");
  });
});
