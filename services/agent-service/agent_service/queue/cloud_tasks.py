"""Google Cloud Tasks publisher for async run dispatch.

Used when QUEUE_BACKEND=cloud_tasks. Creates an HTTP task that POSTs
``{ "run_id": "<uuid>" }`` to ``CLOUD_TASKS_TARGET_URL`` (typically
``…/v1/internal/tasks/run``) with OIDC and/or ``X-Internal-Token``.

The google-cloud-tasks client is imported lazily so pytest / local postgres
mode never requires GCP credentials or the optional package.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from agent_service.config import Settings, get_settings

logger = logging.getLogger(__name__)


def resolve_gcp_project_id(settings: Settings) -> str:
    """Prefer GCP_PROJECT_ID; fall back to GOOGLE_CLOUD_PROJECT."""
    return (settings.GCP_PROJECT_ID or settings.GOOGLE_CLOUD_PROJECT or "").strip()


def missing_cloud_tasks_config(settings: Settings | None = None) -> list[str]:
    """Return names of required Cloud Tasks settings that are unset."""
    s = settings or get_settings()
    missing: list[str] = []
    if not resolve_gcp_project_id(s):
        missing.append("GCP_PROJECT_ID")
    if not (s.GCP_LOCATION or "").strip():
        missing.append("GCP_LOCATION")
    if not (s.CLOUD_TASKS_QUEUE or "").strip():
        missing.append("CLOUD_TASKS_QUEUE")
    if not (s.CLOUD_TASKS_TARGET_URL or "").strip():
        missing.append("CLOUD_TASKS_TARGET_URL")
    # At least one auth mechanism for the worker endpoint.
    has_oidc = bool((s.CLOUD_TASKS_OIDC_SERVICE_ACCOUNT or "").strip())
    has_token = bool((s.INTERNAL_SERVICE_TOKEN or "").strip())
    if not has_oidc and not has_token:
        missing.append("CLOUD_TASKS_OIDC_SERVICE_ACCOUNT (or INTERNAL_SERVICE_TOKEN)")
    return missing


def cloud_tasks_ready(settings: Settings | None = None) -> bool:
    return not missing_cloud_tasks_config(settings)


def enqueue_via_cloud_tasks(*, run_id: str, user_id: str | None = None) -> str:
    """Create a Cloud Task that invokes the internal run worker.

    ``user_id`` is accepted for API symmetry with the postgres enqueue path but
    is not placed in the HTTP body (payload is run_id only — see CLOUD_EXECUTION.md).

    Returns the created task name.
    """
    _ = user_id  # ownership is resolved from the runs row by the worker
    settings = get_settings()
    missing = missing_cloud_tasks_config(settings)
    if missing:
        raise RuntimeError(
            "QUEUE_BACKEND=cloud_tasks is missing required config: " + ", ".join(missing)
        )

    try:
        from google.cloud import tasks_v2
    except ImportError as exc:  # pragma: no cover - optional dep
        raise RuntimeError(
            "google-cloud-tasks is required when QUEUE_BACKEND=cloud_tasks. "
            "Install with: pip install 'agent-service[gcp]'"
        ) from exc

    project = resolve_gcp_project_id(settings)
    location = settings.GCP_LOCATION.strip()
    queue = settings.CLOUD_TASKS_QUEUE.strip()
    target_url = settings.CLOUD_TASKS_TARGET_URL.strip()
    parent = f"projects/{project}/locations/{location}/queues/{queue}"

    headers: dict[str, str] = {"Content-Type": "application/json"}
    token = (settings.INTERNAL_SERVICE_TOKEN or "").strip()
    if token:
        headers["X-Internal-Token"] = token

    http_request: dict[str, Any] = {
        "http_method": tasks_v2.HttpMethod.POST,
        "url": target_url,
        "headers": headers,
        "body": json.dumps({"run_id": run_id}).encode("utf-8"),
    }

    oidc_sa = (settings.CLOUD_TASKS_OIDC_SERVICE_ACCOUNT or "").strip()
    if oidc_sa:
        audience = (settings.CLOUD_TASKS_OIDC_AUDIENCE or "").strip() or target_url
        http_request["oidc_token"] = {
            "service_account_email": oidc_sa,
            "audience": audience,
        }

    client = tasks_v2.CloudTasksClient()
    response = client.create_task(
        request={
            "parent": parent,
            "task": {"http_request": http_request},
        }
    )
    task_name = response.name or ""
    logger.info(
        "cloud_tasks_enqueued run_id=%s queue=%s task=%s",
        run_id,
        queue,
        task_name,
    )
    return task_name
