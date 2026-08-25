import { describe, expect, it } from "vitest";

/**
 * A field whose choices live in the connected account (x-remote-options) must
 * never fall back to a plain text box: an id typed by hand is exactly what
 * the agent cannot resolve, and a Google Sheets file picker rendered as text
 * broke the agent that read it. Empty choices show a reload state, and empty
 * answers retry themselves — Pipedream can answer [] once or twice right
 * after a connect, before the account is queryable.
 */
type FieldState = "select" | "loading" | "reload" | "text";

function renderStateFor({
  remote,
  loading,
  optionCount,
}: {
  remote: boolean;
  loading: boolean;
  optionCount: number;
}): FieldState {
  if (loading && optionCount === 0) return "loading";
  if (remote && optionCount === 0) return "reload";
  if (optionCount > 0) return "select";
  return "text";
}

const RETRY_DELAYS_MS = [2000, 5000, 10000];

function nextRetryDelay(attempt: number): number | null {
  if (attempt > RETRY_DELAYS_MS.length) return null;
  return RETRY_DELAYS_MS[attempt - 1] ?? null;
}

describe("a remote-options field never renders as a text box", () => {
  it("shows the choices when they arrived", () => {
    expect(renderStateFor({ remote: true, loading: false, optionCount: 12 })).toBe("select");
  });

  it("shows a loading state while the choices are on their way", () => {
    expect(renderStateFor({ remote: true, loading: true, optionCount: 0 })).toBe("loading");
  });

  it("shows a reload control — not a text box — when the answer came back empty", () => {
    expect(renderStateFor({ remote: true, loading: false, optionCount: 0 })).toBe("reload");
  });

  it("keeps the text box for fields whose value really is free text", () => {
    expect(renderStateFor({ remote: false, loading: false, optionCount: 0 })).toBe("text");
  });
});

describe("empty answers retry themselves, then stop", () => {
  it("spaces three attempts to cover the just-connected window", () => {
    expect(nextRetryDelay(1)).toBe(2000);
    expect(nextRetryDelay(2)).toBe(5000);
    expect(nextRetryDelay(3)).toBe(10000);
  });

  it("gives up after the third attempt instead of hammering", () => {
    expect(nextRetryDelay(4)).toBeNull();
  });
});
