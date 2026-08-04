"""Application configuration loaded from environment variables / .env file."""

from functools import lru_cache

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
    # Legacy HS256 shared secret (fallback when JWKS is not configured).
    SUPABASE_JWT_SECRET: str = ""

    APP_ORIGIN: str = "http://localhost:3000"
    INTERNAL_SERVICE_TOKEN: str = ""
    DATABASE_URL: str = ""
    SENTRY_DSN: str = ""

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"

    @model_validator(mode="after")
    def _validate_production(self) -> "Settings":
        """Fail fast in production when required variables are missing.

        Error messages list variable NAMES only — never values.
        """
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
            if missing:
                raise ValueError(
                    f"Missing required production environment variables: {', '.join(missing)}"
                )
        return self


@lru_cache
def get_settings() -> Settings:
    """Return a cached Settings instance."""
    return Settings()
