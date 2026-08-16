# Stack32 production — Agent API on Cloud Run + Cloud Tasks + Scheduler + Secret Manager.
# Conservative defaults vs staging (min instances, lower concurrency, tighter max).
# Do NOT hardcode project IDs or secrets — pass via -var / tfvars (gitignored).
#
# Usage (after gcloud auth and operator approval):
#   cd infra/terraform/environments/production
#   terraform init
#   terraform plan -var="project_id=YOUR_PROJECT" -var="region=europe-west1"
#   terraform apply   # only when explicitly authorized

terraform {
  required_version = ">= 1.6.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.40"
    }
  }
}

variable "project_id" {
  type = string
}

variable "region" {
  type    = string
  default = "europe-west1"
}

variable "image" {
  type        = string
  description = "Artifact Registry image URI for agent-service"
  default     = ""
}

variable "min_instance_count" {
  type        = number
  description = "Cloud Run minimum instances (1 avoids cold starts for hosted agents)"
  default     = 1
}

variable "max_instance_count" {
  type        = number
  description = "Cloud Run maximum instances (conservative ceiling)"
  default     = 10
}

variable "container_concurrency" {
  type        = number
  description = "Max concurrent requests per Cloud Run instance"
  default     = 40
}

variable "scheduler_tick_url" {
  type        = string
  description = "Full URL for POST …/v1/internal/tasks/schedules/tick (empty = skip job)"
  default     = ""
}

variable "scheduler_cron" {
  type        = string
  description = "Cloud Scheduler cron for schedule ticks"
  default     = "* * * * *"
}

provider "google" {
  project = var.project_id
  region  = var.region
}

resource "google_project_service" "services" {
  for_each = toset([
    "run.googleapis.com",
    "artifactregistry.googleapis.com",
    "cloudtasks.googleapis.com",
    "cloudscheduler.googleapis.com",
    "secretmanager.googleapis.com",
    "logging.googleapis.com",
    "iam.googleapis.com",
  ])
  service            = each.key
  disable_on_destroy = false
}

resource "google_artifact_registry_repository" "stack32" {
  location      = var.region
  repository_id = "stack32"
  format        = "DOCKER"
  depends_on    = [google_project_service.services]
}

resource "google_service_account" "agent_api" {
  account_id   = "stack32-agent-api"
  display_name = "Stack32 Agent API"
}

resource "google_service_account" "task_invoker" {
  account_id   = "stack32-task-invoker"
  display_name = "Stack32 Cloud Tasks Invoker"
}

locals {
  secret_ids = [
    "supabase-service-role-key",
    "supabase-database-url",
    "openai-api-key",
    "xai-api-key",
    "litellm-master-key",
    "langfuse-secret-key",
    "sentry-dsn",
    "agent-service-internal-token",
  ]
}

resource "google_secret_manager_secret" "secrets" {
  for_each  = toset(local.secret_ids)
  secret_id = "stack32-production-${each.key}"
  replication {
    auto {}
  }
  depends_on = [google_project_service.services]
}

resource "google_secret_manager_secret_iam_member" "agent_api_access" {
  for_each  = google_secret_manager_secret.secrets
  secret_id = each.value.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.agent_api.email}"
}

resource "google_cloud_run_v2_service" "agent_api" {
  count    = var.image == "" ? 0 : 1
  name     = "stack32-agent-api"
  location = var.region

  template {
    service_account                  = google_service_account.agent_api.email
    max_instance_request_concurrency = var.container_concurrency
    containers {
      image = var.image
      ports { container_port = 8000 }
      env {
        name  = "ENVIRONMENT"
        value = "production"
      }
      env {
        name  = "QUEUE_BACKEND"
        value = "cloud_tasks"
      }
      resources {
        limits = {
          cpu    = "2"
          memory = "2Gi"
        }
      }
      startup_probe {
        http_get {
          path = "/health"
          port = 8000
        }
      }
    }
    scaling {
      min_instance_count = var.min_instance_count
      max_instance_count = var.max_instance_count
    }
  }

  depends_on = [google_project_service.services]
}

resource "google_cloud_tasks_queue" "runs" {
  name     = "stack32-runs-production"
  location = var.region
  rate_limits {
    max_dispatches_per_second = 20
    max_concurrent_dispatches = 40
  }
  retry_config {
    max_attempts = 5
    min_backoff  = "5s"
    max_backoff  = "300s"
  }
  depends_on = [google_project_service.services]
}

resource "google_cloud_scheduler_job" "schedules_tick" {
  count            = var.scheduler_tick_url == "" ? 0 : 1
  name             = "stack32-schedules-tick-production"
  description      = "Claim due agent_schedules and enqueue live runs"
  schedule         = var.scheduler_cron
  time_zone        = "UTC"
  attempt_deadline = "320s"
  region           = var.region

  http_target {
    http_method = "POST"
    uri         = var.scheduler_tick_url
    headers = {
      "Content-Type" = "application/json"
    }
    oidc_token {
      service_account_email = google_service_account.task_invoker.email
      audience              = var.scheduler_tick_url
    }
  }

  depends_on = [google_project_service.services]
}

output "artifact_registry" {
  value = google_artifact_registry_repository.stack32.name
}

output "task_queue" {
  value = google_cloud_tasks_queue.runs.name
}

output "agent_api_service_account" {
  value = google_service_account.agent_api.email
}

output "task_invoker_service_account" {
  value = google_service_account.task_invoker.email
}

output "manual_next_steps" {
  value = <<-EOT
    1. Create secret VERSIONS in Secret Manager for each stack32-production-* secret.
    2. Build/push a release-tagged image to Artifact Registry.
    3. Re-apply with -var="image=..."
    4. Grant Cloud Tasks / Scheduler SA permission to invoke Cloud Run with OIDC.
    5. Point CLOUD_TASKS_TARGET_URL to https://.../v1/internal/tasks/run
    6. Re-apply with -var="scheduler_tick_url=https://.../v1/internal/tasks/schedules/tick"
    7. Confirm QUEUE_INLINE=false and QUEUE_WORKER_ENABLED=false (Cloud Tasks drives work).
  EOT
}
