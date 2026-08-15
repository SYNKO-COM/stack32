# Configuration production — checklist propriétaire

Mis à jour après le merge de `feat/production-publish-hardening` dans `main` et l’application des migrations sur le projet Supabase hébergé **stack32** (`mhwzxpscyvuavpfqxfgm`).

Ce document répond à une seule question : **qu’est-ce qui est déjà fait, et que dois-tu encore configurer ?**

---

## État actuel (résumé)

| Élément | Statut |
| --- | --- |
| Code hardening sur GitHub `main` | **Fait** |
| Migrations Supabase hébergées (usernames, favorites, activation atomique, agent public) | **Fait** |
| Front Vercel branché sur `main` | À vérifier / finaliser chez toi |
| Variables d’env Vercel (Supabase, URL app, agent-service) | À configurer / vérifier |
| Auth Supabase (redirects + CAPTCHA prod) | À vérifier / finaliser |
| Agent API hébergé (Cloud Run + file d’attente GCP) | **Pas encore provisionné** |
| E2B / LLM / SMTP / Pipedream | À configurer selon ce que tu actives |

En bref : **la base Supabase et le code sont prêts**. Il te reste surtout le front (Vercel + Auth) pour un site utilisable, puis GCP + secrets pour le vrai runtime agents en production.

---

## DÉJÀ FAIT — RIEN À REFAIRE

| Domaine | Détail |
| --- | --- |
| Code Git | Branche mergée dans `main` et poussée sur GitHub (`26b3f42` et suivants) |
| Schéma Supabase remote | Toutes les migrations locales sont appliquées, y compris `20260817000001` et `20260817000002` |
| Objets DB vérifiés | `profiles.username`, `agent_favorites`, `reserved_usernames`, RPCs `set_username`, `check_username_availability`, `activate_agent_deployment`, `resolve_published_agent` |
| App Agent API (code) | FastAPI, auth JWT, publish fail-closed, installations, Cloud Tasks dans le code |
| Terraform (code) | Scaffolds `infra/terraform/environments/staging` et `production` prêts — **pas encore appliqués** sur un projet GCP |
| Dockerfile / docs / scripts de charge | Présents dans le repo |
| Local / CI | Captcha désactivé en local ; pas de bypass secret dans l’app |

**Ne jamais** lancer `supabase db reset` sur le projet hébergé.

---

## À FAIRE MAINTENANT — pour que le site web marche (Vercel + Auth)

Priorité haute. Sans ça, le front de prod ne peut pas parler correctement à Supabase / à l’API.

### 1. Vercel (front)

| Étape | Où | Variable / action | Secret ? |
| --- | --- | --- | --- |
| 1 | Vercel → Project → Settings → Git | Branche de production = **`main`** | Non |
| 2 | Vercel → Settings → Environment Variables | `NEXT_PUBLIC_SUPABASE_URL` = URL du projet Supabase | Non (public) |
| 3 | Idem | `NEXT_PUBLIC_SUPABASE_ANON_KEY` (ou publishable key) | Oui côté usage, mais exposée au navigateur par design |
| 4 | Idem | `NEXT_PUBLIC_APP_URL` / `NEXT_PUBLIC_SITE_URL` = ton domaine Vercel (ex. `https://….vercel.app` ou domaine custom) | Non |
| 5 | Idem | `NEXT_PUBLIC_DATA_MODE=supabase` | Non |
| 6 | Idem | `NEXT_PUBLIC_AGENT_SERVICE_URL` = URL publique de l’agent-service **quand** il sera déployé (en attendant, le builder/live cloud ne marchera pas) | Non |
| 7 | Idem (server-only, **sans** `NEXT_PUBLIC_`) | `SUPABASE_SERVICE_ROLE_KEY` si le front serveur en a besoin | **Oui** — Secret Manager / env Vercel encrypted |
| 8 | Deployments | Vérifier que le dernier déploiement `main` est vert | — |

Comment vérifier : ouvrir le site → signup / login → onboarding (avec **username**) → arriver sur le builder.

### 2. Supabase Auth (dashboard)

Le projet existe déjà et le schéma est à jour. Il reste la config Auth liée à ton URL Vercel.

| Étape | Où | Action | Secret ? |
| --- | --- | --- | --- |
| 1 | Supabase → Authentication → URL Configuration | `Site URL` = ton URL Vercel | Non |
| 2 | Idem → Redirect URLs | Ajouter `https://TON_DOMAINE/auth/callback`, `/auth/confirm`, `/verify-email`, `/reset-password`, etc. | Non |
| 3 | Authentication → Providers | Email activé ; Google/GitHub seulement si tu les utilises (avec Client ID/Secret) | Oui pour OAuth |
| 4 | Authentication → Attack Protection / CAPTCHA | Activer hCaptcha/Turnstile **en production** si tu veux anti-abus | Oui (clés captcha) |

Stockage : clés captcha / OAuth dans le dashboard Supabase (et éventuellement mirrored dans Vercel si le front les utilise).

Comment vérifier : signup → e-mail de confirmation reçu → login → pas d’erreur de redirect.

### 3. Comptes déjà onboardés (sans username)

Les anciens comptes peuvent avoir `username = NULL`. Ils doivent choisir un username dans **Settings** avant de pouvoir **Publish**. Les nouveaux onboarding exigent déjà un username.

---

## À FAIRE ENSUITE — runtime agents en production (GCP + agent-service)

Sans cette partie, le **site** peut s’afficher, mais builder / live / schedules / publish smoke E2B ne tourneront pas en vrai sur un serveur partagé.

### 4. Google Cloud

| Étape | Provider | Action | Variables attendues | Secret ? | Stockage |
| --- | --- | --- | --- | --- | --- |
| 1 | Google Cloud Console | Créer un projet + **activer la facturation** | `GCP_PROJECT_ID` | Non | Env / TF vars |
| 2 | CLI | `gcloud auth login` + `gcloud auth application-default login` | — | Oui (compte Google) | Machine locale |
| 3 | Région | Recommandé `europe-west1` | `GCP_LOCATION` | Non | Env |
| 4 | Terraform | `cd infra/terraform/environments/staging` puis `terraform init` / `plan` / `apply` (avec ton accord) | `project_id`, `region`, plus tard `image`, `scheduler_tick_url` | Non (IDs) | TF state |
| 5 | Artifact Registry + build | Builder et pousser l’image Docker agent-service | `image=…` | Non | Registry |
| 6 | Secret Manager | Remplir les **versions** des secrets (coquilles créées par TF) | Voir liste ci-dessous | **Oui** | Secret Manager |
| 7 | Cloud Run | Service agent API exposé HTTPS | URL → `NEXT_PUBLIC_AGENT_SERVICE_URL` + `CLOUD_TASKS_TARGET_URL` | Non (URL) | Vercel + Cloud Run env |
| 8 | Cloud Tasks + Scheduler | File + job tick schedules | `QUEUE_BACKEND=cloud_tasks`, `CLOUD_TASKS_QUEUE`, `CLOUD_TASKS_OIDC_SERVICE_ACCOUNT`, `INTERNAL_SERVICE_TOKEN` | Token = **oui** | Secret Manager / Cloud Run |

Secrets typiques à mettre dans Secret Manager (jamais dans git) :

- `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`
- `INTERNAL_SERVICE_TOKEN`
- `OPENAI_API_KEY` / `XAI_API_KEY` (et autres LLM si besoin)
- `SECRETS_ENCRYPTION_KEY` (Fernet BYOK)
- `E2B_API_KEY`
- `SENTRY_DSN` (optionnel)
- credentials Pipedream / SMTP si utilisés

Comment vérifier :

- `GET https://TON_AGENT_SERVICE/health` → ok
- `GET https://TON_AGENT_SERVICE/ready` → prêt (sinon message de config manquante)
- Publish d’un agent + chat consumer sur `/@username/slug`

### 5. E2B (sandbox builder)

| Étape | Où | Variables | Secret ? |
| --- | --- | --- | --- |
| 1 | https://e2b.dev/dashboard | Créer API key | **Oui** |
| 2 | Cloud Run env | `BUILDER_SANDBOX_ENABLED=true`, `SANDBOX_PROVIDER=e2b`, `E2B_API_KEY=…` | Key = oui |

### 6. Fournisseurs LLM

| Étape | Variables | Secret ? | Notes |
| --- | --- | --- | --- |
| 1 | `OPENAI_API_KEY` et/ou `XAI_API_KEY` | Oui | Au moins une pour le Builder côté plateforme |
| 2 | `SECRETS_ENCRYPTION_KEY` | Oui | Chiffrement des clés BYOK utilisateur |
| 3 | `LIVE_REQUIRE_USER_LLM_KEY=true` | Non | Comportement actuel recommandé (pas de partage des clés créateur) |

### 7. Supabase ↔ agent-service

| Étape | Variable | Secret ? | Notes |
| --- | --- | --- | --- |
| 1 | `SUPABASE_URL` | Non | Même projet que le front |
| 2 | `SUPABASE_SERVICE_ROLE_KEY` | **Oui** | Uniquement côté agent-service / serveur |
| 3 | `SUPABASE_JWKS_URL` / `SUPABASE_JWT_ISSUER` / éventuellement `SUPABASE_JWT_SECRET` | Partiel | Validation des JWT utilisateurs |
| 4 | `DATABASE_URL` | **Oui** | Postgres direct (checkpoints LangGraph) — Settings → Database → connection string |

---

## OPTIONNEL (plus tard)

| Élément | Quand | Variables / action |
| --- | --- | --- |
| Pipedream | Intégrations Connect | `PIPEDREAM_CLIENT_ID`, `PIPEDREAM_CLIENT_SECRET`, `PIPEDREAM_PROJECT_ID`, `PIPEDREAM_ENVIRONMENT=production` |
| SMTP | E-mails des runs planifiés | `SMTP_*`, `EMAIL_FROM_*`, `EMAIL_ENABLED=true` |
| Sentry / Langfuse | Observabilité | `SENTRY_DSN`, clés Langfuse |
| Domaine custom | Marque / SEO | DNS → Vercel (+ redirects Auth Supabase) |
| Tests de charge | Avant grosse montée | `scripts/load/` **staging only** |
| Google OAuth natif | Gmail/Calendar first-party | Credentials Google Cloud OAuth |
| Tavily | Recherche web | `WEB_SEARCH_API_KEY` |
| Cloud Armor / hardening réseau | Sécurité avancée | Console GCP |

Hors scope pour l’instant : marketplace, usage anonyme, paiement / pricing, triggers externes type « nouvel e-mail Gmail ».

---

## Ordre recommandé (simple)

1. **Vercel** : variables front + déploiement `main` vert  
2. **Supabase Auth** : Site URL + redirects + (CAPTCHA prod si tu veux)  
3. Tester signup → username → builder  
4. **GCP** : projet + billing + Terraform staging → image Cloud Run  
5. **Secrets** agent-service (Supabase service role, LLM, E2B, token interne)  
6. Mettre `NEXT_PUBLIC_AGENT_SERVICE_URL` sur Vercel vers Cloud Run  
7. Tester publish + page publique `/@username/slug` + My Agents  

---

## Aide-mémoire environnements

| `ENVIRONMENT` | File typique | Notes |
| --- | --- | --- |
| `development` | `postgres`, `QUEUE_INLINE=true` | Local ; mock AI OK |
| `test` | `postgres` | Pytest ; pas de creds GCP |
| `staging` | `cloud_tasks` | Vrai GCP ; proche prod |
| `production` | `cloud_tasks` | Strict ; E2B ; pas de mock |

Références : `.env.example`, `docs/CLOUD_EXECUTION.md`, `docs/PUBLISHING_AND_RUNTIME.md`, `infra/README.md`.
