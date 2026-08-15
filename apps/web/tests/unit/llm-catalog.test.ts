import { describe, expect, it } from "vitest";

import { LLM_MODELS, LLM_PROVIDERS } from "@/lib/ai/llm-catalog";
import { statusToTone } from "@/components/builder/agent-structure/structure-icon";

describe("llm-catalog", () => {
  it("caps each provider at 20 official models", () => {
    for (const provider of LLM_PROVIDERS) {
      expect(LLM_MODELS[provider].length).toBeGreaterThan(0);
      expect(LLM_MODELS[provider].length).toBeLessThanOrEqual(20);
    }
  });
});

describe("structure status tones", () => {
  it("uses orange for idle/ready, amber for setup, green for success, red for error", () => {
    expect(statusToTone("ready")).toBe("orange");
    expect(statusToTone("idle")).toBe("orange");
    expect(statusToTone("setup_required")).toBe("amber");
    expect(statusToTone("success")).toBe("green");
    expect(statusToTone("error")).toBe("red");
    expect(statusToTone("running")).toBe("orange");
  });
});
