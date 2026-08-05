# Stack32 staging — Agent API on Cloud Run + Cloud Tasks + Secret Manager.
# Do NOT apply until GCP_PROJECT_ID and billing are confirmed by the operator.
#
# Usage (after gcloud auth):
#   cd infra/terraform/environments/staging
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

provider "google" {
  project = var.project_id
  region  = var.region
}

resource "google_project_service" "services" {
  for_each = toset([
    "run.googleapis.com",
    "artifactregistry.googleapis.com",
    "cloudtasks.googleapis.com",
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
  secret_id = "stack32-staging-${each.key}"
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
    service_account = google_service_account.agent_api.email
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
          cpu    = "1"
          memory = "1Gi"
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
      min_instance_count = 0
      max_instance_count = 5
    }
  }

  depends_on = [google_project_service.services]
}

resource "google_cloud_tasks_queue" "runs" {
  name     = "stack32-runs-staging"
  location = var.region
  rate_limits {
    max_dispatches_per_second = 10
    max_concurrent_dispatches = 20
  }
  retry_config {
    max_attempts = 5
    min_backoff  = "5s"
    max_backoff  = "300s"
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

output "manual_next_steps" {
  value = <<-EOT
    1. Create secret VERSIONS in Secret Manager for each stack32-staging-* secret.
    2. Build/push image: gcloud builds submit services/agent-service --tag ${var.region}-docker.pkg.dev/${var.project_id}/stack32/agent-service:staging
    3. Re-apply with -var="image=..."
    4. Grant Cloud Tasks SA permission to invoke Cloud Run with OIDC.
    5. Point CLOUD_TASKS_TARGET_URL to https://.../v1/internal/tasks/run
  EOT
}
