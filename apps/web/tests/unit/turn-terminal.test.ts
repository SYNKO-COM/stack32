import { describe, expect, it } from "vitest";

import type { BuilderMessage } from "@/lib/domain/types";
import {
  isTerminalAssistantMessage,
  turnHasInflightWork,
  turnHasTerminalReply,
} from "@/lib/builder/turn-terminal";

function assistant(partial: Partial<BuilderMessage> & { content: string }): BuilderMessage {
  return {
    id: partial.id ?? "a1",
    threadId: "t1",
    role: "assistant",
    createdAt: partial.createdAt ?? new Date().toISOString(),
    ...partial,
  };
}

describe("turn-terminal", () => {
  it("treats post-ready narrative as terminal", () => {
    const msg = assistant({
      content: "Les outils sont configurés.",
      actions: ["open_ai_agent"],
    });
    expect(isTerminalAssistantMessage(msg)).toBe(true);
  });

  it("ignores ephemeral builder acks", () => {
    const msg = assistant({ content: "builder:capabilities.saved" });
    expect(isTerminalAssistantMessage(msg)).toBe(false);
  });

  it("stops activity when terminal reply exists and nothing is in flight", () => {
    const messages: BuilderMessage[] = [
      { id: "u1", threadId: "t1", role: "user", content: "Ajoute Gmail", createdAt: new Date().toISOString() },
      assistant({ id: "p1", card: "build_progress", content: "", steps: [{ labelKey: "building", state: "done" }] }),
      assistant({
        id: "f1",
        content: "Gmail est branché.",
        actions: ["open_ai_agent"],
      }),
    ];
    expect(turnHasTerminalReply(messages)).toBe(true);
    expect(turnHasInflightWork(messages)).toBe(false);
  });

  it("keeps in-flight when progress is still running", () => {
    const messages: BuilderMessage[] = [
      { id: "u1", threadId: "t1", role: "user", content: "Build", createdAt: new Date().toISOString() },
      assistant({
        id: "p1",
        card: "build_progress",
        content: "",
        steps: [{ labelKey: "building", state: "running" }],
      }),
    ];
    expect(turnHasTerminalReply(messages)).toBe(false);
    expect(turnHasInflightWork(messages)).toBe(true);
  });
});
