# Scaler Stack32 à 3000+ apps Pipedream

## Objectif

Chaque app Pipedream doit offrir une **fenêtre de configuration Structure** correcte (outils + triggers) : bons champs, bons labels, bonnes options remote, injection runtime sans redemander les IDs à l'utilisateur.

## Ce qui est déjà en place

| Couche | Rôle |
|--------|------|
| **Découverte JIT** | `search_apps` / `search_actions` / `search_triggers` — pas de catalogue figé |
| **Normalisation schema** | `schema.py` — connection / static / runtime depuis `configurable_props` |
| **Pipeline config** | Structure → DB → runtime Live (alias, injection, prompt CONFIGURED TOOLS) |
| **55 apps curatées** | `app_hints.json` — edge cases (Sheets, Canva, Notion…) |
| **Playbooks** | Succès Live → `tool_config_playbooks` — formes de champs qui marchent |

## Stratégie réaliste (pas 3000 agents manuels)

### Principe

On **ne documente pas 3000 apps à la main**. On combine :

1. **Schema-driven (automatique)** — chaque component Pipedream → hints + UI Structure
2. **Curated overrides (humain)** — ~50–100 apps critiques avec règles métier
3. **Batch enrich (nuit / CI)** — script qui remplit `generated_app_hints.json`
4. **Playbooks (apprentissage)** — promotion des configs qui marchent en prod

### Architecture cible

```
Pipedream API
    ↓
normalize_configurable_props (générique)
    ↓
auto_hints.py → labels, required_props, auth_prop_guess
    ↓
Structure UI (dropdowns remoteOptions)
    ↓
Live → build_configured_props → run_action
    ↓
succès → playbooks → hints enrichis
```

**Priorité runtime :** `app_hints.json` (curated) > `generated_app_hints.json` (batch) > cache JIT (in-process).

## Fichiers clés (nouveau)

| Fichier | Rôle |
|---------|------|
| `agent_service/integrations/pipedream/auto_hints.py` | Génération hints depuis schéma normalisé |
| `docs/pipedream/generated_app_hints.json` | Cache batch (long tail) |
| `scripts/enrich_pipedream_catalog.py` | Enrichissement par lots via API Pipedream |

## Comment enrichir le catalogue (3000 apps)

### Option A — Un processus, une nuit

```bash
cd services/agent-service && source .venv/bin/activate
PYTHONPATH=. python ../../scripts/enrich_pipedream_catalog.py --limit 3000 --concurrency 4
```

### Option B — Multi-processus (30 × 100 apps)

```bash
for offset in 0 100 200 ... 2900; do
  PYTHONPATH=. python ../../scripts/enrich_pipedream_catalog.py \
    --limit 100 --offset $offset --concurrency 3 &
done
wait
```

### Option C — Sans batch (déjà actif)

Dès qu'un utilisateur ouvre la config d'un outil, le provider charge le component → **hints JIT** en mémoire. Aucun fichier requis pour que ça fonctionne ; le batch accélère Builder/readiness offline.

## Triggers

Même pipeline : `GET /integrations/triggers/{id}` normalise le component trigger ; champs `remoteOptions` → Structure ; deploy via `triggers/service.py`.

## Tests

| Suite | Couverture |
|-------|------------|
| `test_auto_hints.py` | Génération + merge curated/auto |
| `test_pipedream_schema.py` | Classification props |
| `test_tool_config_runtime.py` | Injection runtime |
| `scripts/enrich_pipedream_catalog.py` | Smoke manuel avec credentials |

**CI recommandé :** matrice offline `run_scenario_matrix.py` + échantillon aléatoire 20 apps si credentials CI.

## Prochaines étapes (par priorité)

1. **Lancer enrich batch** en prod/staging avec credentials → remplir `generated_app_hints.json`
2. **reloadProps généralisé** — wizard UI multi-étapes (Canva/Sheets pattern pour toutes apps)
3. **Cache persistant components** — DB `pipedream_component_cache` (latence + rate limits)
4. **Étendre curated** — top 100 apps par usage réel Stack32 (pas les 3000 d'un coup)

## Ce qu'on ne casse pas

- Les 55 entrées `app_hints.json` restent la source de vérité pour les edge cases
- Le pipeline Live Sheets/Gmail déployé (`684da26`) est inchangé
- OAuth / isolation comptes / approval modes intacts
