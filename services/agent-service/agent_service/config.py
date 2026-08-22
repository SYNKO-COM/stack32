"""Application configuration loaded from environment variables / .env file."""

from functools import lru_cache
from typing import Literal

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime settings for the agent service."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    ENVIRONMENT: str = "development"
    CORS_ORIGINS: list[str] = ["http://localhost:3000"]
    LOG_LEVEL: str = "INFO"

    # Supabase
    SUPABASE_URL: str = ""
    SUPABASE_SERVICE_ROLE_KEY: str = ""
    SUPABASE_JWKS_URL: str = ""
    SUPABASE_JWT_ISSUER: str = ""
    SUPABASE_JWT_SECRET: str = ""
    # Opt-in only for local stubs. Forbidden in production.
    ALLOW_UNVERIFIED_JWT: bool = False

    APP_ORIGIN: str = "http://localhost:3000"
    INTERNAL_SERVICE_TOKEN: str = ""
    DATABASE_URL: str = ""
    SENTRY_DSN: str = ""
    LANGFUSE_PUBLIC_KEY: str = ""
    LANGFUSE_SECRET_KEY: str = ""
    LANGFUSE_HOST: str = "https://cloud.langfuse.com"

    # Model gateway / providers (optional — at least one required for live LLM)
    OPENAI_API_KEY: str = ""
    ANTHROPIC_API_KEY: str = ""
    GEMINI_API_KEY: str = ""
    XAI_API_KEY: str = ""
    MISTRAL_API_KEY: str = ""
    COHERE_API_KEY: str = ""
    GROQ_API_KEY: str = ""
    OPENROUTER_API_KEY: str = ""
    AZURE_OPENAI_API_KEY: str = ""
    AZURE_OPENAI_ENDPOINT: str = ""
    AZURE_OPENAI_API_VERSION: str = ""
    AWS_ACCESS_KEY_ID: str = ""
    AWS_SECRET_ACCESS_KEY: str = ""
    AWS_REGION: str = ""
    GOOGLE_APPLICATION_CREDENTIALS: str = ""
    GOOGLE_CLOUD_PROJECT: str = ""
    GOOGLE_CLOUD_LOCATION: str = ""

    LITELLM_MASTER_KEY: str = ""
    LITELLM_CONFIG_PATH: str = ""
    MODEL_CONFIG_PATH: str = "services/model-gateway/config/models.yaml"

    # Platform-internal Builder routing (OpenAI-first; no xAI defaults).
    MODEL_FAST_PRIMARY: str = "openai/gpt-5.6-luna"
    MODEL_FAST_FALLBACK: str = "openai/gpt-5.6-terra"
    MODEL_BALANCED_PRIMARY: str = "openai/gpt-5.6-terra"
    MODEL_BALANCED_FALLBACK: str = "openai/gpt-5.6-luna"
    MODEL_REASONING_PRIMARY: str = "openai/gpt-5.6-terra"
    MODEL_REASONING_EXPERT: str = "openai/gpt-5.6-sol"
    MODEL_REASONING_FALLBACK: str = "openai/gpt-5.6-sol"
    MODEL_CODING_PRIMARY: str = "openai/gpt-5.6-terra"
    MODEL_CODING_EXPERT: str = "openai/gpt-5.6-sol"
    MODEL_CODING_EXTERNAL_EXPERT: str = "anthropic/claude-sonnet-5"
    MODEL_CODING_FALLBACK: str = "openai/gpt-5.6-sol"
    MODEL_VALIDATOR_PRIMARY: str = "openai/gpt-5.6-terra"
    MODEL_VALIDATOR_FALLBACK: str = "openai/gpt-5.6-luna"
    MODEL_EMBEDDING_PRIMARY: str = "openai/text-embedding-3-small"
    EMBEDDING_DIMENSION: int = 1536

    # Execution / cost controls (Starter ~$20 plan targets)
    AI_EXECUTION_MODE: Literal["live", "mock", "disabled"] = "mock"
    # Generated-agent graph runner: legacy while-loop vs LangGraph StateGraph
    AGENT_RUNTIME_VERSION: Literal["legacy", "langgraph"] = "legacy"
    # When true (dev default): execute inline and skip enqueue.
    # When false (prod): enqueue only; worker claims via lease_run_queue_job.
    QUEUE_INLINE: bool = True
    QUEUE_WORKER_ENABLED: bool = False
    GOOGLE_OAUTH_CLIENT_ID: str = ""
    GOOGLE_OAUTH_CLIENT_SECRET: str = ""
    GOOGLE_OAUTH_REDIRECT_URI: str = "http://localhost:3000/api/connections/google/callback"
    MONTHLY_USER_BUDGET_USD: float = 10.0
    MAX_CONCURRENT_BUILDER_RUNS: int = 2
    MAX_CONCURRENT_LIVE_RUNS: int = 3
    MAX_REPAIR_ATTEMPTS: int = 5
    # Outer Builder quality loops (plan → build → critique → repair). Keep ≤8.
    MAX_QUALITY_LOOPS: int = 6
    MAX_CRITIQUE_ROUNDS: int = 2
    # Builder sandbox coding loops need headroom beyond a short chat turn.
    MAX_LLM_CALLS_PER_RUN: int = 36
    MAX_LLM_CALLS_PER_CODING_REPAIR: int = 24
    # --- Coding agent capacity -------------------------------------------
    # 2048 output tokens truncates any file over ~150 lines mid-write, which
    # sends the agent straight into a repair loop it cannot win. Real coding
    # agents need room to emit a whole file or a large patch in one turn.
    # Cloud Tasks caps the HTTP dispatch deadline at 30 minutes and defaults to
    # 10. Leaving it unset meant a build past 10 minutes was abandoned and
    # retried while Cloud Run kept working on the first attempt.
    CLOUD_TASKS_DISPATCH_DEADLINE_SECONDS: int = 1800
    # A Cloud Tasks delivery that is retried while the first attempt is still
    # executing must not restart the run: the whole LLM build would be paid for
    # again. Treat a run as in-flight until its lease expires.
    #
    # Must stay comfortably ABOVE CLOUD_TASKS_DISPATCH_DEADLINE_SECONDS. Cloud
    # Tasks gives up at the deadline and retries while Cloud Run (timeout 3600s)
    # is still working; an equal lease would expire at exactly that moment and
    # hand the retry a run that is very much alive. The margin also bounds how
    # long a genuinely hung run blocks its own recovery.
    RUN_LEASE_SECONDS: int = 2400
    CODING_MAX_OUTPUT_TOKENS: int = 8192
    # ReAct turns per coding/repair session (gather -> act -> verify -> repair).
    CODING_MAX_TURNS: int = 25
    # Live/runtime replies stay short; kept separate from the coding budget.
    LIVE_MAX_OUTPUT_TOKENS: int = 4096
    LLM_CALL_TIMEOUT_SECONDS: int = 45
    LLM_TIMEOUT_FAST: int = 45
    LLM_TIMEOUT_BALANCED: int = 90
    LLM_TIMEOUT_REASONING: int = 120
    LLM_TIMEOUT_CODING: int = 150
    LLM_TIMEOUT_CODING_HARD: int = 180
    LLM_TIMEOUT_VALIDATOR: int = 90
    MAX_VARIABLE_AI_COST_RATIO: float = 0.25
    BUILDER_USE_RESPONSES_API: bool = False
    BUILDER_BROWSER_DEBUG_ENABLED: bool = False
    RATE_LIMIT_PER_USER_PER_MINUTE: int = 20
    RATE_LIMIT_PER_IP_PER_MINUTE: int = 60
    WEB_SEARCH_API_KEY: str = ""
    WEB_SEARCH_PROVIDER: str = "tavily"

    # Pipedream Connect (optional — mock/degraded when unset)
    PIPEDREAM_CLIENT_ID: str = ""
    PIPEDREAM_CLIENT_SECRET: str = ""
    PIPEDREAM_PROJECT_ID: str = ""
    PIPEDREAM_ENVIRONMENT: Literal["development", "production"] = "development"
    PIPEDREAM_ALLOWED_ORIGINS: list[str] = []
    # Per-project Connect webhook signing key (optional; trigger-level keys preferred).
    PIPEDREAM_WEBHOOK_SIGNING_KEY: str = ""
    # Public base URL of this service (Cloud Run). Used for Pipedream webhook_url
    # when APP_ORIGIN is localhost. Example: https://stack32-agent-api-….run.app
    AGENT_SERVICE_PUBLIC_URL: str = ""

    # Fernet key or passphrase for BYOK secret encryption (required in production)
    SECRETS_ENCRYPTION_KEY: str = ""
    # Builder uses platform keys; Live requires user BYOK by default
    LIVE_REQUIRE_USER_LLM_KEY: bool = True

    # --- Builder coding sandbox (M-A) ---------------------------------------
    # Master switch for the isolated coding workspace. Off by default so the
    # legacy declarative Builder keeps working until the coding loop is wired.
    BUILDER_SANDBOX_ENABLED: bool = False
    # Provider-neutral selection. "local" is a hardened dev/test backend that
    # runs under a confined temp dir; it is FORBIDDEN in production. "e2b" uses
    # isolated Firecracker microVMs and is the production backend.
    SANDBOX_PROVIDER: Literal["local", "e2b"] = "local"
    E2B_API_KEY: str = ""
    E2B_TEMPLATE: str = "base"
    # Resource / safety envelope applied to every sandbox command.
    SANDBOX_COMMAND_TIMEOUT_SECONDS: int = 120
    SANDBOX_WALL_CLOCK_SECONDS: int = 900
    SANDBOX_MAX_OUTPUT_BYTES: int = 200_000
    SANDBOX_MAX_FILE_BYTES: int = 2_000_000
    SANDBOX_ALLOW_NETWORK: bool = False

    # --- Email notifications (M5) -------------------------------------------
    # SMTP transport for terminal scheduled-run notifications. The auth user and
    # the From header are intentionally distinct (auth=hello@, From=no_reply@).
    SMTP_HOST: str = ""
    SMTP_PORT: int = 465
    SMTP_USERNAME: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_USE_TLS: bool = True  # True = implicit TLS (465); False = STARTTLS (587)
    EMAIL_FROM_ADDRESS: str = "no_reply@stack32.com"
    EMAIL_FROM_NAME: str = "Stack32"
    # When false (default in dev/test), emails are logged, not sent.
    EMAIL_ENABLED: bool = False

    # Queue — postgres (local/default) or cloud_tasks (GCP staging/production)
    QUEUE_BACKEND: Literal["postgres", "cloud_tasks"] = "postgres"
    CLOUD_TASKS_QUEUE: str = ""
    CLOUD_TASKS_TARGET_URL: str = ""
    # Service account email used by Cloud Tasks for OIDC to Cloud Run (optional if
    # INTERNAL_SERVICE_TOKEN is sent as X-Internal-Token on the HTTP task).
    CLOUD_TASKS_OIDC_SERVICE_ACCOUNT: str = ""
    # Audience for the OIDC token; defaults to CLOUD_TASKS_TARGET_URL when empty.
    CLOUD_TASKS_OIDC_AUDIENCE: str = ""
    GCP_PROJECT_ID: str = ""
    GCP_LOCATION: str = "europe-west1"

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"

    @property
    def is_production_like(self) -> bool:
        """Production or local production-like profile (strict runtime invariants)."""
        env = (self.ENVIRONMENT or "").strip().lower()
        return env in {"production", "production-like"}

    @property
    def has_any_llm_provider(self) -> bool:
        return bool(
            self.OPENAI_API_KEY
            or self.XAI_API_KEY
            or self.ANTHROPIC_API_KEY
            or self.GEMINI_API_KEY
            or self.OPENROUTER_API_KEY
            or self.GROQ_API_KEY
            or self.MISTRAL_API_KEY
        )

    @model_validator(mode="after")
    def _validate_production(self) -> "Settings":
        if self.is_production or self.is_production_like:
            missing = [
                name
                for name in (
                    "SUPABASE_URL",
                    "SUPABASE_SERVICE_ROLE_KEY",
                    "INTERNAL_SERVICE_TOKEN",
                )
                if not getattr(self, name)
            ]
            if not self.SUPABASE_JWKS_URL and not self.SUPABASE_JWT_SECRET:
                missing.append("SUPABASE_JWKS_URL (or SUPABASE_JWT_SECRET)")
            if self.ALLOW_UNVERIFIED_JWT:
                raise ValueError("ALLOW_UNVERIFIED_JWT must be false in production")
            if self.AI_EXECUTION_MODE == "mock":
                raise ValueError(
                    "AI_EXECUTION_MODE=mock is forbidden in production / production-like"
                )
            if self.AGENT_RUNTIME_VERSION == "legacy":
                raise ValueError(
                    "AGENT_RUNTIME_VERSION=legacy is forbidden in production / production-like; "
                    "use langgraph"
                )
            if self.SANDBOX_PROVIDER == "local":
                raise ValueError(
                    "SANDBOX_PROVIDER=local is forbidden in production / production-like; use e2b."
                )
            if self.BUILDER_SANDBOX_ENABLED and self.SANDBOX_PROVIDER == "e2b" and not self.E2B_API_KEY:
                missing.append("E2B_API_KEY")
            if not self.BUILDER_SANDBOX_ENABLED and self.is_production:
                raise ValueError(
                    "BUILDER_SANDBOX_ENABLED must be true in production (E2B isolation required)"
                )
            if not self.SECRETS_ENCRYPTION_KEY:
                missing.append("SECRETS_ENCRYPTION_KEY")
            if self.AGENT_RUNTIME_VERSION == "langgraph" and not self.DATABASE_URL:
                missing.append("DATABASE_URL (required for langgraph checkpoints)")
            pipedream_configured = bool(
                self.PIPEDREAM_CLIENT_ID
                and self.PIPEDREAM_CLIENT_SECRET
                and self.PIPEDREAM_PROJECT_ID
            )
            if pipedream_configured and self.PIPEDREAM_ENVIRONMENT != "production":
                raise ValueError(
                    "PIPEDREAM_ENVIRONMENT must be 'production' in production / "
                    "production-like when Pipedream Connect is configured; "
                    "development mode caps Connect at test accounts."
                )
            if missing:
                raise ValueError(
                    f"Missing required production environment variables: {', '.join(missing)}"
                )
        return self


@lru_cache
def get_settings() -> Settings:
    """Return a cached Settings instance."""
    return Settings()
