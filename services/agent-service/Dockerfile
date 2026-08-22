# Build context: services/ (see CI: docker build -f agent-service/Dockerfile ...)
FROM python:3.12-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY stack32-agent-runtime /tmp/stack32-agent-runtime
COPY agent-service/pyproject.toml agent-service/README.md ./
COPY agent-service/agent_service ./agent_service

# Install runtime + service together so the local path satisfies the dep.
# gcp = Cloud Tasks (production queue); sandbox = E2B builder coding agent;
# observability = sentry-sdk. Without the last one, setting SENTRY_DSN silently
# does nothing: _maybe_init_sentry logs "sdk not installed" and returns, so the
# service runs with no error reporting at all.
RUN pip install --no-cache-dir --prefix=/install \
      /tmp/stack32-agent-runtime \
      ".[gcp,sandbox,observability]"

FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/install/bin:$PATH" \
    PYTHONPATH="/install/lib/python3.12/site-packages"

RUN apt-get update \
    && apt-get upgrade -y --no-install-recommends \
    && apt-get install -y --no-install-recommends libpq5 \
    && useradd --create-home --uid 10001 --shell /usr/sbin/nologin appuser \
    && mkdir -p /app \
    && chown -R appuser:appuser /app \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /install /install
COPY --chown=appuser:appuser agent-service/agent_service /app/agent_service
COPY --chown=appuser:appuser agent-service/pyproject.toml agent-service/README.md /app/

WORKDIR /app
USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health')" || exit 1

CMD ["uvicorn", "agent_service.main:app", "--host", "0.0.0.0", "--port", "8000"]
