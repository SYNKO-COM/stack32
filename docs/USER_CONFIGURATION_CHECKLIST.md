# Checklist de configuration — Phase 3

## 1. Supabase (obligatoire)

1. Local: `pnpm supabase:start` puis `pnpm supabase:reset` (local only).
2. Hosted: `pnpm supabase:push` — **jamais** `db reset` sur le remote.
3. Dans `services/agent-service/.env` :
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_JWKS_URL=https://<ref>.supabase.co/auth/v1/.well-known/jwks.json`
   - `SUPABASE_JWT_ISSUER=https://<ref>.supabase.co/auth/v1`
   - `DATABASE_URL` = connection string directe Postgres (Settings → Database)
4. Dans `apps/web/.env.local` : URL + publishable/anon + service role (server-only).

## 2. Clés LLM (au moins une)

| Provider | Où créer | Variable | Obligatoire MVP ? |
| --- | --- | --- | --- |
| OpenAI | https://platform.openai.com/api-keys | `OPENAI_API_KEY` | **Oui (recommandé)** — fast/balanced/embeddings |
| xAI Grok | https://console.x.ai/ | `XAI_API_KEY` | **Oui (recommandé)** — reasoning Builder |
| Autres | voir `.env.example` | … | Optionnel |

Tester: `curl http://localhost:8000/v1/providers/health`

Désactiver: vider la clé et redémarrer.

## 3. Modes d’exécution

```bash
# apps/web/.env.local
AI_EXECUTION_MODE=agent-service
AGENT_SERVICE_URL=http://localhost:8000
AGENT_SERVICE_INTERNAL_TOKEN=<random 32+ bytes>

# services/agent-service/.env
AI_EXECUTION_MODE=live          # or mock without keys
INTERNAL_SERVICE_TOKEN=<same as above>
```

## 4. Google Cloud (quand tu es prêt — pas fait automatiquement)

1. Créer un projet + activer la facturation
2. Région conseillée: `europe-west1`
3. Activer APIs: Cloud Run, Artifact Registry, Cloud Tasks, Secret Manager, Logging
4. `gcloud auth login && gcloud auth application-default login`
5. `cd infra/terraform/environments/staging && terraform init`
6. `terraform plan -var="project_id=TON_PROJECT"`
7. Appliquer **seulement** après confirmation
8. Créer les versions de secrets listées dans `infra/README.md`
9. Build/push image puis re-apply avec `-var="image=..."`

Jusqu’à GCP: `QUEUE_BACKEND=postgres` suffit pour les runs sans navigateur.

## 5. Observabilité (optionnel)

- Langfuse: `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY`
- Sentry: `SENTRY_DSN`

## 6. Search tool (optionnel)

- Tavily: `WEB_SEARCH_API_KEY`

## 7. Builder sandbox E2B (coding agent)

1. Créer une clé sur https://e2b.dev/dashboard
2. Dans `services/agent-service/.env` :
   ```bash
   BUILDER_SANDBOX_ENABLED=true
   SANDBOX_PROVIDER=e2b
   E2B_API_KEY=e2b_…
   E2B_TEMPLATE=base
   SANDBOX_ALLOW_NETWORK=false
   ```
3. `SANDBOX_PROVIDER=local` est interdit en production.
4. Tester: créer un workspace E2B via le SDK ou un build Builder avec sandbox activée.

## 8. Commandes staging smoke (après GCP)

```bash
gcloud run services describe stack32-agent-api --region=europe-west1
curl -H "Authorization: Bearer <user-jwt>" https://<cloud-run-url>/ready
# enqueue a run then verify completion without browser
```
