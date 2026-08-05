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

    MODEL_FAST_PRIMARY: str = "openai/gpt-4.1-mini"
    MODEL_FAST_FALLBACK: str = "xai/grok-3-mini"
    MODEL_BALANCED_PRIMARY: str = "openai/gpt-4.1-mini"
    MODEL_BALANCED_FALLBACK: str = "xai/grok-3-mini"
    MODEL_REASONING_PRIMARY: str = "xai/grok-4.5"
    MODEL_REASONING_FALLBACK: str = "openai/gpt-4.1"
    # Coding profiles — OpenAI Codex + xAI Grok Code
    MODEL_CODING_PRIMARY: str = "openai/gpt-5.1-codex"
    MODEL_CODING_FALLBACK: str = "xai/grok-code-fast-1"
    MODEL_VALIDATOR_PRIMARY: str = "openai/gpt-4.1-mini"
    MODEL_VALIDATOR_FALLBACK: str = "xai/grok-3-mini"
    MODEL_EMBEDDING_PRIMARY: str = "openai/text-embedding-3-small"
    EMBEDDING_DIMENSION: int = 1536

    # Execution / cost controls (Starter ~$20 plan targets)
    AI_EXECUTION_MODE: Literal["live", "mock", "disabled"] = "mock"
    MONTHLY_USER_BUDGET_USD: float = 10.0
    MAX_CONCURRENT_BUILDER_RUNS: int = 2
    MAX_CONCURRENT_LIVE_RUNS: int = 3
    MAX_REPAIR_ATTEMPTS: int = 2
    MAX_LLM_CALLS_PER_RUN: int = 6
    LLM_CALL_TIMEOUT_SECONDS: int = 45
    RATE_LIMIT_PER_USER_PER_MINUTE: int = 20
    RATE_LIMIT_PER_IP_PER_MINUTE: int = 60
    WEB_SEARCH_API_KEY: str = ""
    WEB_SEARCH_PROVIDER: str = "tavily"
    # Fernet key or passphrase for BYOK secret encryption (required in production)
    SECRETS_ENCRYPTION_KEY: str = ""
    # Builder uses platform keys; Live requires user BYOK by default
    LIVE_REQUIRE_USER_LLM_KEY: bool = True

    # Queue
    QUEUE_BACKEND: Literal["postgres", "cloud_tasks"] = "postgres"
    CLOUD_TASKS_QUEUE: str = ""
    CLOUD_TASKS_TARGET_URL: str = ""
    GCP_PROJECT_ID: str = ""
    GCP_LOCATION: str = "europe-west1"

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"

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
        if self.is_production:
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
            if missing:
                raise ValueError(
                    f"Missing required production environment variables: {', '.join(missing)}"
                )
        return self


@lru_cache
def get_settings() -> Settings:
    """Return a cached Settings instance."""
    return Settings()
