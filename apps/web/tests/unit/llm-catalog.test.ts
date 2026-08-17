import { describe, expect, it } from "vitest";

import { LLM_MODELS, LLM_PROVIDERS } from "@/lib/ai/llm-catalog";
import { statusToTone } from "@/components/builder/agent-structure/structure-icon";
import {
  llmProviderIconSrc,
  resolveIntegrationIcon,
} from "@/lib/integrations/icon-resolver";

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

describe("llm provider icons", () => {
  it("maps each catalog provider to a local transparent logo", () => {
    expect(llmProviderIconSrc("openai")).toBe("/llm-providers/openai.svg");
    expect(llmProviderIconSrc("anthropic")).toBe("/llm-providers/anthropic.svg");
    expect(llmProviderIconSrc("google")).toBe("/llm-providers/gemini.svg");
    expect(llmProviderIconSrc("gemini")).toBe("/llm-providers/gemini.svg");
    expect(llmProviderIconSrc("xai")).toBe("/llm-providers/xai.svg");
    expect(llmProviderIconSrc("mistral")).toBe("/llm-providers/mistral.svg");
    expect(llmProviderIconSrc("groq")).toBe("/llm-providers/groq.svg");
    expect(llmProviderIconSrc("openrouter")).toBe("/llm-providers/openrouter.svg");
  });

  it("uses the selected provider logo on the model structure node", () => {
    expect(
      resolveIntegrationIcon({ appKey: "model", provider: "xai", kind: "model" }).value,
    ).toBe("/llm-providers/xai.svg");
    expect(
      resolveIntegrationIcon({ appKey: "model", provider: "anthropic", kind: "model" }).value,
    ).toBe("/llm-providers/anthropic.svg");
  });
});
