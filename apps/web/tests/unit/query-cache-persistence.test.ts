/**
 * A reload should not claim your accounts are gone.
 *
 * Connections and readiness are fetched after hydration, so every refresh
 * showed "not connected" for the model and for every tool, for as long as the
 * round trip took, before correcting itself. The page was asserting a negative
 * it had not checked yet.
 */

import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import {
  attachQueryCachePersistence,
  type CacheStore,
} from "@/lib/query-cache-persistence";

/** Stands in for sessionStorage, which the node test environment has no DOM for. */
function fakeStore(): CacheStore {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

function newClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

async function settle() {
  await new Promise((r) => setTimeout(r, 500));
}

describe("what survives a reload", () => {
  it("hands the next load the accounts the last one fetched", async () => {
    const store = fakeStore();
    const first = newClient();
    const detach = attachQueryCachePersistence(first, store);
    first.setQueryData(["connections", "agent-1"], { connections: [{ id: "c1" }] });
    await settle();
    detach();

    const second = newClient();
    const detach2 = attachQueryCachePersistence(second, store);
    expect(second.getQueryData(["connections", "agent-1"])).toEqual({
      connections: [{ id: "c1" }],
    });
    detach2();
  });

  it("keeps readiness too, so the chip does not flicker", async () => {
    const store = fakeStore();
    const first = newClient();
    const detach = attachQueryCachePersistence(first, store);
    first.setQueryData(["agent-readiness", "agent-1"], { status: "ready" });
    await settle();
    detach();

    const second = newClient();
    const detach2 = attachQueryCachePersistence(second, store);
    expect(second.getQueryData(["agent-readiness", "agent-1"])).toEqual({
      status: "ready",
    });
    detach2();
  });

  it("never keeps anything about a run in flight", async () => {
    const store = fakeStore();
    const first = newClient();
    const detach = attachQueryCachePersistence(first, store);
    // A stale "running" would be a lie; a stale account list is a beat behind.
    first.setQueryData(["live-execution", "run-1"], { runStatus: "running" });
    await settle();
    detach();

    const second = newClient();
    const detach2 = attachQueryCachePersistence(second, store);
    expect(second.getQueryData(["live-execution", "run-1"])).toBeUndefined();
    detach2();
  });

  it("does not overwrite what this session already fetched", async () => {
    const store = fakeStore();
    const first = newClient();
    const detach = attachQueryCachePersistence(first, store);
    first.setQueryData(["connections", "agent-1"], { connections: [{ id: "old" }] });
    await settle();
    detach();

    const second = newClient();
    second.setQueryData(["connections", "agent-1"], { connections: [{ id: "fresh" }] });
    const detach2 = attachQueryCachePersistence(second, store);
    expect(second.getQueryData(["connections", "agent-1"])).toEqual({
      connections: [{ id: "fresh" }],
    });
    detach2();
  });

  it("survives a store that refuses to co-operate", () => {
    const blocked: CacheStore = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {},
    };
    const client = newClient();
    expect(() => attachQueryCachePersistence(client, blocked)()).not.toThrow();
  });

  it("ignores a corrupt payload rather than failing to start", () => {
    const store = fakeStore();
    store.setItem("stack32:query-cache:v1", "{not json");
    const client = newClient();
    expect(() => attachQueryCachePersistence(client, store)()).not.toThrow();
  });

  it("does nothing at all when there is no store", () => {
    const client = newClient();
    expect(() => attachQueryCachePersistence(client, null)()).not.toThrow();
  });
});
