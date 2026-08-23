import { describe, expect, it } from "vitest";

import { summarizeActivity, type RunActivityEvent } from "@/hooks/use-run-activity";

/**
 * The feed used to collapse every event into ~20 fixed aggregate lines
 * ("read 5 files") and keep them all on screen, so a build ended as a wall of
 * checked-off items rather than an agent working. These lock the timeline
 * behaviour: chronological order, merged repeats, and a single active step.
 */
function ev(eventType: string, sequence: number, path?: string): RunActivityEvent {
  return { eventType, sequence, path };
}

describe("summarizeActivity", () => {
  it("keeps events in the order they happened", () => {
    const { lines } = summarizeActivity([
      ev("builder.tests.started", 3),
      ev("builder.sandbox.ready", 1),
      ev("builder.file.created", 2, "src/agent/tools.py"),
    ]);
    expect(lines.map((l) => l.baseKey)).toEqual(["sandbox", "wroteOne", "testsRun"]);
  });

  it("merges consecutive repeats into one step with a count", () => {
    const { lines } = summarizeActivity([
      ev("builder.file.read", 1, "a.py"),
      ev("builder.file.read", 2, "b.py"),
      ev("builder.file.read", 3, "c.py"),
    ]);
    expect(lines).toHaveLength(1);
    expect(lines[0].key).toBe("readOnePlus");
    expect(lines[0].params).toMatchObject({ path: "c.py", count: 2 });
  });

  it("does not merge across different kinds", () => {
    const { lines } = summarizeActivity([
      ev("builder.file.read", 1, "a.py"),
      ev("builder.file.created", 2, "b.py"),
      ev("builder.file.read", 3, "c.py"),
    ]);
    expect(lines.map((l) => l.baseKey)).toEqual(["readOne", "wroteOne", "readOne"]);
  });

  it("marks only the most recent step as active", () => {
    const { lines } = summarizeActivity([
      ev("builder.sandbox.ready", 1),
      ev("builder.tests.started", 2),
      ev("builder.tests.passed", 3),
    ]);
    expect(lines.filter((l) => l.active)).toHaveLength(1);
    expect(lines.at(-1)?.active).toBe(true);
  });

  it("tags each step with a kind so the UI can differentiate them", () => {
    const { lines } = summarizeActivity([
      ev("builder.file.read", 1, "a.py"),
      ev("builder.file.created", 2, "b.py"),
      ev("builder.tests.failed", 3),
      ev("builder.model.call", 4),
    ]);
    expect(lines.map((l) => l.kind)).toEqual(["read", "write", "error", "think"]);
  });

  it("hides mutations when watching someone else's run", () => {
    const { lines } = summarizeActivity(
      [ev("builder.file.created", 1, "a.py"), ev("builder.file.read", 2, "b.py")],
      { readOnly: true },
    );
    expect(lines.every((l) => l.baseKey !== "wroteOne")).toBe(true);
  });

  it("shows a thinking beat rather than nothing before the first event", () => {
    expect(summarizeActivity([]).lines).toHaveLength(1);
    expect(summarizeActivity([]).lines[0].active).toBe(true);
  });

  it("ignores event types it does not recognise", () => {
    const { lines } = summarizeActivity([
      ev("builder.file.read", 1, "a.py"),
      ev("some.internal.bookkeeping", 2),
    ]);
    expect(lines).toHaveLength(1);
  });

  it("surfaces a rejected repair as an error beat", () => {
    const { lines } = summarizeActivity([ev("builder.repair.rejected", 1)]);
    expect(lines[0]).toMatchObject({ baseKey: "repairRejected", kind: "error" });
  });
});

describe("tool detail extraction", () => {
  it("names the file a coding tool touched, even when it sits under args", () => {
    // builder.file.read reports {tool, args:{path}} while builder.file.created
    // reports {path}. Reading only the top level left every file the agent
    // opened showing as a nameless "Reading …".
    const { lines } = summarizeActivity([
      { eventType: "builder.file.read", sequence: 1, path: "/home/user/workspace/src/agent/tools.py" },
    ]);
    expect(lines[0].params?.path).toBe("tools.py");
  });

  it("says which command ran instead of just 'ran a command'", () => {
    const { lines } = summarizeActivity([
      { eventType: "builder.command.completed", sequence: 1, command: "python -m pytest -q" },
    ]);
    expect(lines[0].key).toBe("ranCommandDetail");
    expect(String(lines[0].params?.detail)).toContain("pytest");
  });

  it("unwraps bash -c so the inner command is shown", () => {
    const { lines } = summarizeActivity([
      { eventType: "builder.command.completed", sequence: 1, command: 'bash -c "ruff check . --fix"' },
    ]);
    expect(String(lines[0].params?.detail)).toContain("ruff");
    expect(String(lines[0].params?.detail)).not.toContain("bash");
  });

  it("surfaces the search term for grep steps", () => {
    const { lines } = summarizeActivity([
      { eventType: "builder.context.searching", sequence: 1, query: "build_registry" },
    ]);
    expect(lines[0].key).toBe("searchingDetail");
    expect(lines[0].params?.detail).toBe("build_registry");
  });

  it("falls back to the plain label when there is no detail", () => {
    const { lines } = summarizeActivity([
      { eventType: "builder.command.completed", sequence: 1 },
    ]);
    expect(lines[0].key).toBe("ranCommand");
  });
});

describe("failed tool calls", () => {
  it("never narrates an action the agent failed to perform", () => {
    // A write refused by the protected-path guard used to appear as a completed
    // edit, because the event was emitted before the tool ran.
    const { lines } = summarizeActivity([
      { eventType: "builder.file.patch.completed", sequence: 1, path: "vendor/runtime/context.py", ok: false },
      { eventType: "builder.file.created", sequence: 2, path: "src/agent/tools.py" },
    ]);
    expect(lines).toHaveLength(1);
    expect(lines[0].params?.path).toBe("tools.py");
  });

  it("still shows successful calls that omit the flag", () => {
    const { lines } = summarizeActivity([
      { eventType: "builder.file.created", sequence: 1, path: "src/agent/main.py" },
    ]);
    expect(lines).toHaveLength(1);
  });
});
