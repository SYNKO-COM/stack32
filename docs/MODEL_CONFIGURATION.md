# Model Configuration Guide

## Recommended MVP providers

| Provider | Env var | Signup | Role |
| --- | --- | --- | --- |
| OpenAI | `OPENAI_API_KEY` | https://platform.openai.com/api-keys | fast, balanced, embeddings |
| xAI (Grok 4.5) | `XAI_API_KEY` | https://console.x.ai/ | reasoning / Builder (`xai/grok-4.5`) |

Optional: Anthropic, Gemini, Groq, Mistral, Cohere, OpenRouter, Azure, Bedrock — see `.env.example`.

## Profiles

Configured in `services/model-gateway/config/models.yaml` and env overrides `MODEL_*_PRIMARY` / `MODEL_*_FALLBACK`.

Business code calls `ModelProfile` — never hardcodes provider SDKs.

## Local setup

1. Copy `.env.example` → `services/agent-service/.env`
2. Set `OPENAI_API_KEY` and/or `XAI_API_KEY`
3. Set `AI_EXECUTION_MODE=live` in agent-service `.env`
4. Set `AI_EXECUTION_MODE=agent-service` in `apps/web/.env.local`
5. `curl http://localhost:8000/v1/providers/health` — keys show as `configured` (never printed)

## Disable a provider

Remove or empty its API key. The router skips models whose provider key is missing and uses fallbacks.

## Rotate a key

1. Create a new key at the provider.
2. Update local `.env` or Secret Manager version.
3. Restart agent-service / Cloud Run.
4. Revoke the old key.

## Secret Manager (staging)

Store as `stack32-staging-openai-api-key`, `stack32-staging-xai-api-key`, etc.
Never put provider keys in Supabase client-accessible tables.

## Cost target (Starter ~$20)

- Monthly user budget default: `MONTHLY_USER_BUDGET_USD=10` (LLM cost share)
- Fast path for simple edits
- Max 2 automatic repairs
- Prefer mini / Grok over flagship models for Builder specialists
