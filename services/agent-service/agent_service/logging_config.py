"""Structured (JSON) logging using the standard library only."""

import json
import logging
from contextvars import ContextVar
from datetime import UTC, datetime
from typing import Any

# Holds the request id for the current request, set by RequestIDMiddleware.
request_id_var: ContextVar[str | None] = ContextVar("request_id", default=None)
run_id_var: ContextVar[str | None] = ContextVar("run_id", default=None)
user_id_var: ContextVar[str | None] = ContextVar("user_id", default=None)
agent_id_var: ContextVar[str | None] = ContextVar("agent_id", default=None)


# Python level names map 1:1 onto Cloud Logging severities except WARN/FATAL.
_CLOUD_SEVERITY = {
    "DEBUG": "DEBUG",
    "INFO": "INFO",
    "WARNING": "WARNING",
    "WARN": "WARNING",
    "ERROR": "ERROR",
    "CRITICAL": "CRITICAL",
    "FATAL": "CRITICAL",
}


class JSONFormatter(logging.Formatter):
    """Format log records as single-line JSON objects."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, object] = {
            "timestamp": datetime.now(UTC).isoformat(),
            # Cloud Logging reads "severity"; it ignores "level" entirely. Emitting
            # only "level" meant every ERROR landed with default severity, so
            # `severity>=ERROR` queries returned nothing and production errors were
            # invisible — the sandbox build failures in this run had to be found by
            # grepping raw text. "level" is kept for local readers.
            "severity": _CLOUD_SEVERITY.get(record.levelname, record.levelname),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        request_id = request_id_var.get()
        if request_id is not None:
            payload["request_id"] = request_id
        run_id = run_id_var.get()
        if run_id is not None:
            payload["run_id"] = run_id
        user_id = user_id_var.get()
        if user_id is not None:
            payload["user_id"] = user_id
        agent_id = agent_id_var.get()
        if agent_id is not None:
            payload["agent_id"] = agent_id
        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)
        return json.dumps(payload)


def bind_log_context(
    *,
    run_id: str | None = None,
    user_id: str | None = None,
    agent_id: str | None = None,
) -> dict[str, Any]:
    """Attach optional identifiers to subsequent structured log lines.

    Returns tokens suitable for :func:`reset_log_context`.
    """
    tokens: dict[str, Any] = {}
    if run_id is not None:
        tokens["run_id"] = run_id_var.set(run_id)
    if user_id is not None:
        tokens["user_id"] = user_id_var.set(user_id)
    if agent_id is not None:
        tokens["agent_id"] = agent_id_var.set(agent_id)
    return tokens


def reset_log_context(tokens: dict[str, Any]) -> None:
    """Reset contextvars previously set by :func:`bind_log_context`."""
    if "run_id" in tokens:
        run_id_var.reset(tokens["run_id"])
    if "user_id" in tokens:
        user_id_var.reset(tokens["user_id"])
    if "agent_id" in tokens:
        agent_id_var.reset(tokens["agent_id"])


def setup_logging(level: str = "INFO") -> None:
    """Configure the root logger with the JSON formatter."""
    handler = logging.StreamHandler()
    handler.setFormatter(JSONFormatter())
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(level.upper())
