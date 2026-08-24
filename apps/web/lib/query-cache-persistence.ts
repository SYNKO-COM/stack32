/**
 * Keep the answers a reload already knows.
 *
 * Connections and readiness are fetched after hydration, so on every refresh
 * the drawer rendered "not connected" for a few seconds — for the model and
 * for every tool — before the response arrived and corrected it. Nothing was
 * wrong; the page was simply asserting a negative it had not yet checked.
 *
 * These answers change rarely and are cheap to keep, so the previous one is
 * written to sessionStorage and seeded back on the next load. The page opens
 * showing what it last knew and refetches underneath.
 *
 * sessionStorage, not localStorage: this is a convenience cache of one tab's
 * view, and it should not outlive the tab.
 */

import type { QueryClient } from "@tanstack/react-query";

const STORAGE_KEY = "stack32:query-cache:v1";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Query keys worth keeping. Anything about a run in flight is deliberately
 * absent — a stale "running" would be a lie, where a stale account list is
 * merely a beat behind.
 */
const PERSISTED_PREFIXES = ["connections", "agent-readiness", "integrations"] as const;

type Entry = { key: unknown[]; data: unknown; at: number };

/** The slice of sessionStorage this uses, so a test can hand in its own. */
export interface CacheStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function defaultStore(): CacheStore | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    // Storage can be blocked outright by browser settings.
    return null;
  }
}

function isPersisted(key: readonly unknown[]): boolean {
  const head = key[0];
  return (
    typeof head === "string" &&
    (PERSISTED_PREFIXES as readonly string[]).includes(head)
  );
}

function read(store: CacheStore): Entry[] {
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    return parsed.filter(
      (e): e is Entry =>
        !!e &&
        typeof e === "object" &&
        Array.isArray((e as Entry).key) &&
        typeof (e as Entry).at === "number" &&
        now - (e as Entry).at < MAX_AGE_MS,
    );
  } catch {
    return [];
  }
}

function write(store: CacheStore, entries: Entry[]): void {
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // A full or blocked store costs us the head start, nothing more.
  }
}

/** Seed the client with the last known answers, then keep them up to date. */
export function attachQueryCachePersistence(
  client: QueryClient,
  store: CacheStore | null = defaultStore(),
): () => void {
  if (!store) return () => {};

  for (const entry of read(store)) {
    if (!isPersisted(entry.key)) continue;
    // Never overwrite something this session already fetched.
    if (client.getQueryData(entry.key) !== undefined) continue;
    client.setQueryData(entry.key, entry.data, { updatedAt: entry.at });
  }

  let timer: ReturnType<typeof setTimeout> | null = null;
  const flush = () => {
    timer = null;
    const entries: Entry[] = [];
    for (const query of client.getQueryCache().getAll()) {
      const key = query.queryKey as unknown[];
      if (!isPersisted(key)) continue;
      if (query.state.status !== "success" || query.state.data === undefined) continue;
      entries.push({ key, data: query.state.data, at: query.state.dataUpdatedAt });
    }
    write(store, entries);
  };

  const unsubscribe = client.getQueryCache().subscribe((event) => {
    if (!isPersisted(event.query.queryKey as unknown[])) return;
    if (timer) return;
    timer = setTimeout(flush, 400);
  });

  return () => {
    if (timer) clearTimeout(timer);
    unsubscribe();
  };
}

/** Drop everything kept — used when the person signs out. */
export function clearPersistedQueryCache(
  store: CacheStore | null = defaultStore(),
): void {
  if (!store) return;
  try {
    store.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do.
  }
}
