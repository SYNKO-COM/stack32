# Platform model hierarchy (Builder / coding agent)

## Profiles → models

| Profile | Primary | Fallback / expert |
|---------|---------|-------------------|
| FAST (intent, identity, forms) | `openai/gpt-5.6-luna` | terra |
| BALANCED (builder chat, moderate spec) | `openai/gpt-5.6-terra` | luna |
| REASONING (architecture, heavy) | terra | sol (+ reasoning expert) |
| CODING | terra | sol → `anthropic/claude-sonnet-5` |
| VALIDATOR | terra | luna |

## Coding repair loops (autonomous)

| Iteration | Stage | Model | Reasoning |
|-----------|-------|-------|-----------|
| 1 | `patch` | Terra | medium |
| 2 | `repair_hard` | Sol | xhigh |
| 3–5 | `repair_expert` | Claude Sonnet 5 | high |
| Exhausted | — | Surface UI `fix_automatically` with problem context |

xAI/Grok remains BYOK for **user** Live agents only — not platform Builder defaults.
