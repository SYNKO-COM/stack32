import { describe, expect, it } from "vitest";
import { mapBuilderMessage } from "@/lib/domain/mappers";
// Persistence mapper must preserve an explicit creator refusal, not replace it with the UI default.
describe("Chrome builder capability", () => {
  it("preserves disabled Chrome in the tool-review payload", () => {
    expect(
      mapBuilderMessage({
        id: "message",
        run_id: null,
        agent_id: "agent",
        thread_id: "thread",
        user_id: "user",
        role: "assistant",
        content: "tools",
        created_at: "2026-09-28T00:00:00Z",
        metadata: {
          ui_component: {
            type: "tool_review_form",
            request_id: "review",
            chrome_enabled: false,
            tools: [],
          },
        },
      })?.uiComponent?.chromeEnabled,
    ).toBe(false);
  });
});
