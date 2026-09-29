# Validation — résultats et limites

Contrôles locaux du 29 septembre 2026 dans une copie isolée de `preprod`. Aucun compte client, clé de modèle hébergé ou service de production utilisé. Les services préprod distants ont seulement fait l’objet d’une lecture de métadonnées.

## Contrôles exécutés

| Contrôle | Résultat et portée |
| --- | --- |
| Pytest agent-service, Python 3.14.6 | **1 347 tests réussis**, 58 avertissements (dont dépréciations et clés HMAC de fixtures). Environnement vide, aucun `.env` réel. |
| Ruff | Réussi. |
| Bandit `-ll` | Aucun problème moyen/élevé ; 43 observations faibles dans l’ensemble du service. |
| Vitest Web | **267 tests, 44 fichiers réussis**. |
| TypeScript | `tsc --noEmit` réussi. Nouveaux types DB ajoutés manuellement ; régénération Supabase restante. |
| ESLint | 0 erreur, 42 avertissements existants. |
| Build optimisé Next.js | Réussi avec `NEXT_PUBLIC_DATA_MODE=mock`, environnement vide et sans identifiants réels. Téléchargement des polices existantes autorisé. Les trois routes `/browser` sont compilées. |
| Chromium isolé | **14 tests réussis** : véritable chargement MV3 et refus sans geste utilisateur ; opérations sur DOM réel avec réseau de fixture intercepté. Aucun profil Chrome utilisateur. |
| Garde-fou déploiement | **4 tests réussis** sur métadonnées fictives ; contrôle réel API + worker préprod refusé comme attendu sur les références `stack32-production-*`. Aucun secret lu. |
| Migration SQL, PostgreSQL 17 local | Réussie sur schéma minimal de fixtures avec vraies FK : tables/RLS/droits, enqueue, commande concurrente refusée, plafond 30 étapes, heartbeat expiré, cascade de révocation. Aucun Supabase distant. |
| Package | ZIP déterministe, MV3 0.1.0, 9 fichiers, aucun secret ou test empaqueté. |

La CI utilise Python 3.12, différent du Python local. Son pipeline a été complété mais n’a pas été lancé à distance. Docker/Colima n’était pas démarré : migrations complètes Supabase, pgTAP, génération effective des types et E2E Web contre toute la pile Supabase **non validés ici**.

## Matrice demandée

| Scénario | Preuve locale | Reste à vérifier connecté |
| --- | --- | --- |
| 1. Rédaction | Graphe LangGraph réel avec gateway modèle simulée : réponse sans Chrome, aucun enqueue ; premier formulaire même sans intégrations. | Choix du modèle réel et publication sans extension. |
| 2. Extension absente | Seule la demande inoffensive est exposée ; interruption et lien ; aucun enqueue même avec outils approuvés. | Parcours Live complet jusqu’à installation. |
| 3. Site non autorisé | Origine sans session refusée ; Chromium refuse l’injection sans geste `activeTab`. | Clic physique d’octroi, puis appairage réel. |
| 4. Site autorisé | DOM Chromium : lecture/saisie/aperçu/confirmation/résultat vérifié sur fixture. | Chaîne Web → API → DB → extension → API → runtime → modèle. |
| 5. Créateur désactive | Version actuelle invalide l’ancien pin ; endpoint créateur, booléen strict. | Désactivation via Structure pendant une session réelle. |
| 6. Deux utilisateurs | Refus des croisements identité/installation/thread dans les tests serveur. | Deux comptes et deux profils simultanés. |
| 7. Révocation/domaine/expiry | Tests de sessions expirées/déconnectées, heartbeat/logout, navigation/formulaire interdomaines, queue/révocation SQL. | Fermetures réelles, redirect, logout et attente 15 minutes. |
| 8. Page malveillante | Texte traité comme donnée ; aucune action arbitraire ni autre origine. | Réponse du modèle réel ; aucune immunité générale à l’injection n’est revendiquée. |
| 9. Message | Aucun effet avant confirmation ; valeurs/destination affichées ; changement d’aperçu invalide ; formulaires opaques refusés. | Confirmation dans la vraie fenêtre MV3 et transport intégré, sans envoi réel. |
| 10. Régressions | Suites backend/Web, typage/lint/build ; anciennes specs n’activent pas Chrome. | CI complète, migrations Supabase, publication et intégrations isolées. |

## Reproduction locale

Depuis la racine, dépendances de développement installées et sans `.env` réel :

```sh
pnpm --filter @stack32/web test
pnpm --filter @stack32/web typecheck
pnpm --filter @stack32/web lint
pnpm --filter @stack32/web exec playwright install chromium
pnpm test:chrome
python3 -m unittest discover -s scripts/tests
python3 scripts/package-chrome.py
```

Dans `services/agent-service`, venv avec `stack32-agent-runtime` et `agent-service[dev]` : `ruff check .`, `pytest -q`, `bandit -r agent_service -ll`.

`scripts/tests/browser-postgres.sql` crée des rôles et un schéma minimal : exécuter avec `psql -f` uniquement dans un cluster PostgreSQL local jetable vierge (socket local, aucune écoute TCP). Jamais sur une base distante. Ce script ne remplace pas `supabase test db`.

`manifest.test.mjs` charge l’extension dans un profil temporaire et intercepte/annule les destinations HTTPS ; `page.test.mjs` utilise la fonction empaquetée sur un DOM Chromium avec HTML intercepté. L’`eval` du harnais de test est absent du ZIP. Ces essais ne prouvent pas un appairage Stack32 connecté.

## Protocole manuel préprod — non exécuté

Prérequis : secrets de test isolés, migration/déploiement de `DEPLOYMENT.md`, comptes de test A/B et créateur C, modèle dédié, pages synthétiques. Relever SHA, révisions API/worker, déploiement Web, version ZIP, profils et heure ; aucune preuve ne doit contenir code utilisable, jeton ou donnée privée.

1. **Création/rédaction.** Sans extension, créer un agent de rédaction. Chrome apparaît en premier et activé dans Outils ; construire/publier sans installation. Demander un texte : aucun appel Chrome. Sur un autre agent, désactiver le réglage puis modifier/réparer : le refus persiste.
2. **Demande.** A installe l’agent dans son compte et demande de lire `#task-region` sur `https://pre-prod-659874458xx.stack32.com/browser/test`. Attendre suspension et lien de connexion, sans résultat inventé.
3. **Appairage.** Charger le ZIP, créer un code depuis la session A, ouvrir la page de test, cliquer l’icône Stack32, coller le code et autoriser. Vérifier agent/site/expiration. Code consommé inutilisable, code >2 minutes refusé, code utilisé sur un autre site refusé. Garder les deux fenêtres ouvertes, reprendre la conversation.
4. **Lecture/saisie.** Lire `#task-region` : commande fictive 42, carnet bleu, 12 euros. Saisir « Bonjour test » dans `#message` : aucune modification avant confirmation ; après confirmation, lire explicitement ce champ pour vérifier la valeur.
5. **Message fictif.** Demander le clic de `#send-test`. L’aperçu contient `test@example.invalid`, le texte exact, la destination et le bouton. Refuser : `#result` inchangé. Reconnecter, refaire, modifier le texte après aperçu : consentement invalidé. Refaire sans modification et confirmer : `#result` affiche `SIMULATED ONLY`. Aucun message réel n’est envoyé ; ne pas présenter cela comme un essai sur une plateforme réelle.
6. **Isolation A/B/C.** B utilise le même agent dans un profil séparé avec son installation et un autre texte fictif. A ne reçoit aucune donnée/commande de B. Essayer les identifiants installation/thread de B depuis A : refus. C n’a pas de contrôle des sessions d’abonnés ; ses tests utilisent sa propre installation.
7. **Arrêt.** Sur des sessions séparées : Arrêter, Retirer l’accès, fermer l’onglet, fermer le contrôle, fermer Chrome, fermer la page Web, se déconnecter. Attendre au plus les délais de présence 15/30 secondes : aucune nouvelle commande. Un effet déjà envoyé peut rester non confirmé et ne doit pas être rejoué automatiquement.
8. **Limites.** Navigation/redirect vers un autre domaine de test : arrêt et nouveau consentement. Expiry 15 minutes, confirmation après timeout 60 secondes et plafond 30 étapes : refus propre. Aucun élargissement par le modèle.
9. **Désactivation.** Pendant la session A, C ouvre Structure → nœud Agent → Navigateur Chrome et désactive. La prochaine vérification refuse les actions de A, même avec une ancienne version épinglée. B ne peut pas changer la définition.
10. **Page hostile.** Lire `#untrusted-example` ; l’agent doit rapporter le texte comme donnée sans en suivre l’instruction de collecte ou étendre ses droits. Tester aussi password/CAPTCHA/OTP et bouton opaque : intervention manuelle, aucun contournement. Investiguer toute action inattendue.
11. **Régressions.** Avec ces seuls comptes : builder, modification, publication, installation, chat sans Chrome et intégration officielle dédiée aux tests. Consigner les résultats réels et compléter les captures Store manquantes.

Aucune étape connectée n’est cochée comme réussie à ce stade.
