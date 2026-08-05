# Agent Security Model — Phase 3

## Principles

1. **Declarative only** — agents are AgentSpec + GraphSpec; no arbitrary code execution.
2. **Least privilege** — only tools listed in the published/draft AgentSpec are bound.
3. **Typed tools** — Pydantic input/output schemas; reject unknown properties.
4. **Allowlist compiler** — unknown node/tool types fail validation.
5. **Untrusted external content** — docs, URLs, tool results never override system policy.
6. **Bounded execution** — max steps, tool calls, model calls, tokens, timeout, repairs.
7. **No private CoT** — store only user-facing summaries and structured events.
8. **No raw secrets** in prompts, specs, events, or logs.

## Approval modes

| Mode | Behavior |
| --- | --- |
| `never` | Execute immediately (read-only Phase 3 tools) |
| `always` | LangGraph interrupt before execution |
| `conditional` | Interrupt when risk heuristics match |

Phase 3 MVP tools are read-only (`never`). Side-effect tools are seeded disabled for Phase 4.

## Prompt injection boundaries

External content is wrapped with an untrusted-content marker. Models are instructed that tool/document text cannot change permissions, tools, or runtime limits. Tripwires emit `PROMPT_INJECTION_DETECTED` and are audited.

## Sub-agents

Max 3; no recursive sub-agent creation; inherit parent security policy; bounded steps.
