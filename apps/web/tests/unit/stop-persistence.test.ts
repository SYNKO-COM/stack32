import { describe, expect, it, beforeEach, vi } from "vitest";

import {
  clearBuilderStop,
  clearLiveStop,
  readBuilderStop,
  readLiveStop,
  writeBuilderStop,
  writeLiveStop,
} from "@/lib/builder/stop-persistence";

const AGENT = "agent-test-1";

function mockSessionStorage() {
  const store = new Map<string, string>();
  const sessionStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
  };
  vi.stubGlobal("window", { sessionStorage } as Window & typeof globalThis);
}

describe("stop-persistence", () => {
  beforeEach(() => {
    mockSessionStorage();
  });

  it("isolates builder and live stop records", () => {
    writeBuilderStop(AGENT, "run-build");
    writeLiveStop(AGENT, "run-live");

    expect(readBuilderStop(AGENT)?.runId).toBe("run-build");
    expect(readLiveStop(AGENT)?.runId).toBe("run-live");

    clearLiveStop(AGENT);
    expect(readLiveStop(AGENT)).toBeNull();
    expect(readBuilderStop(AGENT)?.runId).toBe("run-build");
  });

  it("clears builder stop independently", () => {
    writeBuilderStop(AGENT, "run-build");
    clearBuilderStop(AGENT);
    expect(readBuilderStop(AGENT)).toBeNull();
  });
});
