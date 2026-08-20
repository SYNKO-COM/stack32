import { describe, expect, it } from "vitest";

import { summarizeActivity } from "@/hooks/use-run-activity";

describe("summarizeActivity", () => {
  it("hides file writes and repairs in chat (read-only) mode", () => {
    const lines = summarizeActivity(
      [
        { eventType: "builder.chat.started", sequence: 1 },
        { eventType: "project.file.created", sequence: 2, path: "tools.json" },
        { eventType: "builder.tests.passed", sequence: 3 },
        { eventType: "builder.repair.started", sequence: 4 },
      ],
      { readOnly: true },
    ).lines;
    expect(lines.map((l) => l.key)).toEqual(["thinking"]);
    expect(lines.some((l) => l.key === "wroteOne" || l.key === "wroteMany")).toBe(false);
    expect(lines.some((l) => l.key === "repair" || l.key === "testsOk")).toBe(false);
  });

  it("does not show planning/repair leftovers when chat has only mutation events", () => {
    const lines = summarizeActivity(
      [
        { eventType: "builder.spec.updated", sequence: 1 },
        { eventType: "builder.tests.passed", sequence: 2 },
      ],
      { readOnly: true },
    ).lines;
    expect(lines.map((l) => l.key)).toEqual(["thinking"]);
  });
});
