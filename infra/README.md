# Infrastructure

Phase 1 keeps infrastructure minimal. Planned target (see PRD §22.4):

- **Web**: Vercel (`apps/web`)
- **Agent service**: Google Cloud Run (`services/agent-service`, Dockerfile provided)
- **Database / Auth / Storage / Vectors**: Supabase (`supabase/`)
- **Billing**: Whop (scaffolded, not integrated yet)
- **CI**: GitHub Actions (`.github/workflows/ci.yml`)

TODO(phase-7): Terraform / deployment manifests, Cloud Tasks, Secret Manager, observability (Sentry, Langfuse, OpenTelemetry).
