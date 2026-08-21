export const LLM_PROVIDERS = [
  "openai",
  "anthropic",
  "google",
  "xai",
  "mistral",
  "groq",
  "openrouter",
] as const;

export type LlmProviderId = (typeof LLM_PROVIDERS)[number];

/** Providers available for Live agent brain via Pipedream Connect. */
export const LIVE_LLM_PROVIDERS = ["openai", "anthropic", "xai", "mistral"] as const;

export type LiveLlmProviderId = (typeof LIVE_LLM_PROVIDERS)[number];

/** Stack32 Live provider → Pipedream Connect app slug. */
export const LIVE_LLM_PIPEDREAM_APP: Record<LiveLlmProviderId, string> = {
  openai: "openai",
  anthropic: "anthropic",
  // Official Pipedream name_slug is x_ai (API key app), not "xai".
  xai: "x_ai",
  mistral: "mistral_ai",
};

export function pipedreamAppForLlmProvider(provider: string): string {
  const key = provider.toLowerCase() as LiveLlmProviderId;
  return LIVE_LLM_PIPEDREAM_APP[key] || provider;
}

export interface LlmModelOption {
  id: string;
  label: string;
}

/** Official chat/text model IDs, newest first, capped at 20 per provider. */
export const LLM_MODELS: Record<LlmProviderId, LlmModelOption[]> = {
  openai: [
    { id: "gpt-5.6-sol", label: "GPT-5.6 Sol" },
    { id: "gpt-5.6", label: "GPT-5.6" },
    { id: "gpt-5.6-terra", label: "GPT-5.6 Terra" },
    { id: "gpt-5.6-luna", label: "GPT-5.6 Luna" },
    { id: "gpt-5.5", label: "GPT-5.5" },
    { id: "gpt-5.4", label: "GPT-5.4" },
    { id: "gpt-5.4-mini", label: "GPT-5.4 mini" },
    { id: "gpt-5.4-nano", label: "GPT-5.4 nano" },
    { id: "gpt-5-mini", label: "GPT-5 mini" },
    { id: "gpt-5-nano", label: "GPT-5 nano" },
    { id: "gpt-4.1", label: "GPT-4.1" },
    { id: "gpt-4.1-mini", label: "GPT-4.1 mini" },
    { id: "gpt-4.1-nano", label: "GPT-4.1 nano" },
    { id: "gpt-4o", label: "GPT-4o" },
    { id: "gpt-4o-mini", label: "GPT-4o mini" },
    { id: "o3", label: "o3" },
    { id: "o4-mini", label: "o4-mini" },
    { id: "o3-mini", label: "o3-mini" },
    { id: "gpt-4o-2024-11-20", label: "GPT-4o (2024-11-20)" },
    { id: "gpt-4.1-2025-04-14", label: "GPT-4.1 (2025-04-14)" },
  ],
  anthropic: [
    { id: "claude-fable-5", label: "Claude Fable 5" },
    { id: "claude-opus-5", label: "Claude Opus 5" },
    { id: "claude-sonnet-5", label: "Claude Sonnet 5" },
    { id: "claude-opus-4-8", label: "Claude Opus 4.8" },
    { id: "claude-opus-4-7", label: "Claude Opus 4.7" },
    { id: "claude-opus-4-6", label: "Claude Opus 4.6" },
    { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
    { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5" },
    { id: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
    { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5 (20251001)" },
    { id: "claude-opus-4-5", label: "Claude Opus 4.5" },
    { id: "claude-sonnet-4", label: "Claude Sonnet 4" },
    { id: "claude-opus-4", label: "Claude Opus 4" },
    { id: "claude-3-7-sonnet-latest", label: "Claude 3.7 Sonnet" },
    { id: "claude-3-5-haiku-latest", label: "Claude 3.5 Haiku" },
    { id: "claude-3-5-sonnet-latest", label: "Claude 3.5 Sonnet" },
    { id: "claude-3-opus-latest", label: "Claude 3 Opus" },
    { id: "claude-3-haiku-20240307", label: "Claude 3 Haiku" },
    { id: "claude-opus-4-1", label: "Claude Opus 4.1" },
    { id: "claude-sonnet-4-20250514", label: "Claude Sonnet 4 (20250514)" },
  ],
  google: [
    { id: "gemini-3.6-flash", label: "Gemini 3.6 Flash" },
    { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash" },
    { id: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash-Lite" },
    { id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro" },
    { id: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash-Lite" },
    { id: "gemini-3-flash-preview", label: "Gemini 3 Flash" },
    { id: "gemini-omni-flash", label: "Gemini Omni Flash" },
    { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
    { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
    { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite" },
    { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
    { id: "gemini-2.0-flash-lite", label: "Gemini 2.0 Flash-Lite" },
    { id: "gemini-1.5-pro", label: "Gemini 1.5 Pro" },
    { id: "gemini-1.5-flash", label: "Gemini 1.5 Flash" },
    { id: "gemini-1.5-flash-8b", label: "Gemini 1.5 Flash-8B" },
    { id: "gemini-2.5-pro-preview-06-05", label: "Gemini 2.5 Pro (preview)" },
    { id: "gemini-2.5-flash-preview-05-20", label: "Gemini 2.5 Flash (preview)" },
    { id: "gemini-exp-1206", label: "Gemini Experimental 1206" },
    { id: "gemini-2.0-flash-001", label: "Gemini 2.0 Flash 001" },
    { id: "gemini-1.5-pro-latest", label: "Gemini 1.5 Pro latest" },
  ],
  xai: [
    { id: "grok-4.6", label: "Grok 4.6" },
    { id: "grok-4.5", label: "Grok 4.5" },
    { id: "grok-4.20", label: "Grok 4.20" },
    { id: "grok-4", label: "Grok 4" },
    { id: "grok-4-fast-reasoning", label: "Grok 4 Fast Reasoning" },
    { id: "grok-4-fast-non-reasoning", label: "Grok 4 Fast" },
    { id: "grok-3", label: "Grok 3" },
    { id: "grok-3-mini", label: "Grok 3 mini" },
    { id: "grok-3-fast", label: "Grok 3 Fast" },
    { id: "grok-3-mini-fast", label: "Grok 3 mini Fast" },
    { id: "grok-2-1212", label: "Grok 2 (1212)" },
    { id: "grok-2-vision-1212", label: "Grok 2 Vision" },
    { id: "grok-2", label: "Grok 2" },
    { id: "grok-beta", label: "Grok Beta" },
    { id: "grok-2-latest", label: "Grok 2 latest" },
    { id: "grok-3-latest", label: "Grok 3 latest" },
    { id: "grok-4-latest", label: "Grok 4 latest" },
    { id: "grok-2-mini", label: "Grok 2 mini" },
    { id: "grok-vision-beta", label: "Grok Vision Beta" },
    { id: "grok-4.6-latest", label: "Grok 4.6 latest" },
  ],
  mistral: [
    { id: "mistral-large-latest", label: "Mistral Large" },
    { id: "mistral-medium-latest", label: "Mistral Medium" },
    { id: "mistral-medium-2508", label: "Mistral Medium 3.1" },
    { id: "mistral-small-latest", label: "Mistral Small" },
    { id: "mistral-small-2506", label: "Mistral Small 3.2" },
    { id: "codestral-latest", label: "Codestral" },
    { id: "codestral-2501", label: "Codestral 25.01" },
    { id: "devstral-2512", label: "Devstral 2" },
    { id: "magistral-medium-latest", label: "Magistral Medium" },
    { id: "magistral-medium-2507", label: "Magistral Medium 1.1" },
    { id: "magistral-small-latest", label: "Magistral Small" },
    { id: "ministral-14b-latest", label: "Ministral 14B" },
    { id: "ministral-8b-latest", label: "Ministral 8B" },
    { id: "pixtral-large-latest", label: "Pixtral Large" },
    { id: "pixtral-12b-2409", label: "Pixtral 12B" },
    { id: "open-mistral-nemo", label: "Mistral Nemo" },
    { id: "mistral-large-2411", label: "Mistral Large 24.11" },
    { id: "mistral-small-2409", label: "Mistral Small 24.09" },
    { id: "codestral-2405", label: "Codestral 24.05" },
    { id: "labs-leanstral-2603", label: "Leanstral" },
  ],
  groq: [
    { id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B" },
    { id: "llama-3.1-8b-instant", label: "Llama 3.1 8B Instant" },
    { id: "openai/gpt-oss-120b", label: "GPT OSS 120B" },
    { id: "openai/gpt-oss-20b", label: "GPT OSS 20B" },
    { id: "meta-llama/llama-4-maverick-17b-128e-instruct", label: "Llama 4 Maverick" },
    { id: "meta-llama/llama-4-scout-17b-16e-instruct", label: "Llama 4 Scout" },
    { id: "qwen/qwen3-32b", label: "Qwen3 32B" },
    { id: "moonshotai/kimi-k2-instruct", label: "Kimi K2" },
    { id: "deepseek-r1-distill-llama-70b", label: "DeepSeek R1 Distill Llama 70B" },
    { id: "llama-3.2-90b-vision-preview", label: "Llama 3.2 90B Vision" },
    { id: "llama-3.2-11b-vision-preview", label: "Llama 3.2 11B Vision" },
    { id: "llama-3.2-3b-preview", label: "Llama 3.2 3B" },
    { id: "llama-3.2-1b-preview", label: "Llama 3.2 1B" },
    { id: "mixtral-8x7b-32768", label: "Mixtral 8x7B" },
    { id: "gemma2-9b-it", label: "Gemma 2 9B" },
    { id: "llama3-70b-8192", label: "Llama 3 70B" },
    { id: "llama3-8b-8192", label: "Llama 3 8B" },
    { id: "qwen-qwq-32b", label: "QwQ 32B" },
    { id: "mistral-saba-24b", label: "Mistral Saba 24B" },
    { id: "llama-guard-3-8b", label: "Llama Guard 3 8B" },
  ],
  openrouter: [
    { id: "openrouter/auto", label: "Auto" },
    { id: "openai/gpt-5.6-sol", label: "OpenAI GPT-5.6 Sol" },
    { id: "openai/gpt-5.6-terra", label: "OpenAI GPT-5.6 Terra" },
    { id: "openai/gpt-5.6-luna", label: "OpenAI GPT-5.6 Luna" },
    { id: "anthropic/claude-fable-5", label: "Claude Fable 5" },
    { id: "anthropic/claude-opus-5", label: "Claude Opus 5" },
    { id: "anthropic/claude-sonnet-5", label: "Claude Sonnet 5" },
    { id: "google/gemini-3.6-flash", label: "Gemini 3.6 Flash" },
    { id: "google/gemini-3.1-pro-preview", label: "Gemini 3.1 Pro" },
    { id: "x-ai/grok-4.6", label: "Grok 4.6" },
    { id: "deepseek/deepseek-chat-v4-flash", label: "DeepSeek V4 Flash" },
    { id: "qwen/qwen3.8-max", label: "Qwen3.8 Max" },
    { id: "openai/gpt-4o", label: "OpenAI GPT-4o" },
    { id: "openai/gpt-4o-mini", label: "OpenAI GPT-4o mini" },
    { id: "anthropic/claude-sonnet-4.6", label: "Claude Sonnet 4.6" },
    { id: "anthropic/claude-haiku-4.5", label: "Claude Haiku 4.5" },
    { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro" },
    { id: "meta-llama/llama-4-maverick", label: "Llama 4 Maverick" },
    { id: "mistralai/mistral-large", label: "Mistral Large" },
    { id: "moonshotai/kimi-k2", label: "Kimi K2" },
  ],
};

export function modelsForProvider(provider: string): LlmModelOption[] {
  const key = provider.toLowerCase() as LlmProviderId;
  return LLM_MODELS[key] ?? [];
}
