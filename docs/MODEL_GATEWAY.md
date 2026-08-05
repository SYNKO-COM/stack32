# Model Gateway

Interface: `ModelGateway.complete(profile=..., messages=..., response_model=...)`.

Implementation: LiteLLM. Circuit breaker per model. Provider health at `GET /v1/providers/health`.

Router: `agent_service/gateway/router.py` — deterministic `TaskType` → `ModelProfile`.
