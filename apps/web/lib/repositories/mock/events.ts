/**
 * Minimal pub/sub used by mock repositories to notify UI hooks that
 * mock data changed (simulated streaming, timers, ...).
 */

type Listener = () => void;

const listeners = new Set<Listener>();

export function subscribeMockChanges(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitMockChange(): void {
  for (const listener of listeners) listener();
}
