# Déploiement Cloud Run (agent-service)

## Déclencheur GitHub → Cloud Build

Le dépôt utilise **`cloudbuild.yaml`** à la racine. Ne pas utiliser un `Dockerfile` à la racine :
le vrai Dockerfile est `services/agent-service/Dockerfile` avec le contexte **`services/`**.

Si le trigger Cloud Run (console) échoue avec `lstat /workspace/Dockerfile: no such file`, mettre à jour le trigger :

```bash
gcloud builds triggers update rmgpgab-stack32-agent-api-europe-west1-SYNKO-COM-stack32--mawsa \
  --region=global \
  --build-config=cloudbuild.yaml
```

## Déploiement manuel (secours)

```bash
gcloud builds submit services --config=cloudbuild.yaml
```

## Coûts — réglages recommandés (faible trafic)

| Paramètre | Prod économique | Prod confort (cold start) |
|-----------|-----------------|---------------------------|
| `min-instances` | **0** | 1 |
| `cpu-throttling` | **true** | false |
| CPU / RAM | 1 vCPU / 1 Gi | 2 vCPU / 2 Gi |

```bash
gcloud run services update stack32-agent-api \
  --region=europe-west1 \
  --min-instances=0 \
  --cpu-throttling \
  --cpu=1 \
  --memory=1Gi
```

`min-instances=1` + CPU toujours alloué ≈ **2–4 €/jour** même sans utilisateurs.

## Pourquoi ~17 € la semaine dernière (3–4 utilisateurs) ?

En résumé simple : **le serveur tournait H24**, même la nuit sans personne dessus.

| Cause | Explication simple |
|-------|-------------------|
| **1 instance minimum** | Google gardait au moins 1 machine allumée en permanence (~3 €/jour). |
| **CPU toujours actif** | La machine était facturée comme si elle travaillait en continu. |
| **2 processeurs + 2 Go RAM** | Configuration généreuse pour un produit en test. |
| **Beaucoup de déploiements** | ~10 mises en prod le 21 août → builds Cloud Build en plus. |

**Correction appliquée (22 août)** : `min-instances=0`, CPU seulement à la demande, 1 vCPU / 1 Go → **quasi rien quand personne n’utilise l’app** (quelques euros/mois en phase test).

## Estimation grossière (ordre de grandeur)

| Scénario | Cloud Run seul | + Supabase | + IA (incluse dans vos crédits) |
|----------|----------------|------------|----------------------------------|
| **Vous seul, après optimisation** | 0–10 €/mois | 0–25 € (free/pro) | ~0,20 $/mois (plan free) |
| **50 utilisateurs actifs** | 30–80 €/mois | 25–75 €/mois | Couvert par abonnements |
| **300 utilisateurs « max »** | 400–2 000 €/mois* | 75–300 €/mois | Budget LLM plafonné par crédits |

\*300 × 20 agents « en même temps » = charge énorme ; il faudra augmenter `max-instances`, peut‑être plusieurs services, et surtout **l’IA coûte plus que Cloud Run**.

### Revenus vs coûts (300 abonnés payants, hypothèse moyenne)

| Plan | Prix/mois | 300 users | Coût plateforme LLM inclus/user |
|------|-----------|-----------|----------------------------------|
| Starter | 24 $ | 7 200 $ | ~6 $ |
| Pro | 49 $ | 14 700 $ | ~11 $ |
| Scale | 99 $ | 29 700 $ | ~21 $ |

**Exemple réaliste** : 300 users mix (50 % Starter, 40 % Pro, 10 % Scale) → **~12 000 $/mois** de revenus. Coûts infra lourds mais **les crédits limitent la facture IA** ; marge dépend surtout du % d’utilisation réelle vs crédits vendus.

Formule mnémotechnique : **Cloud Run = l’électricité du serveur** ; **Supabase = le classeur** ; **OpenAI/Pipedream = l’essence** (le plus cher à l’échelle).
