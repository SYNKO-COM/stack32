# Stack32 — audit du builder et de l’exécution, 25 octobre 2026

## Cadre et destinations vérifiées

- Production : `https://stack32.com`, branche `main` à `e9690538e7a220dcc82b9b312fe91fe8c326b834`. API `stack32-agent-api-00090-tq8`, worker `stack32-agent-worker-00009-brz`, base `mhwzxpscyvuavpfqxfgm`.
- Préproduction : `https://pre-prod-659874458xx.stack32.com`, branche `preprod` à `9b760b3782f87c7056c5d0ffb3dba4aa60034af5`. Vercel `stack32-preprod` / `prj_Q1gLhC7rGTQwFWTDwj3lYjry68Xs`, déploiement `dpl_7SEa3g3Vocg4cYq87kN7M9nfYk2x`. API `stack32-agent-api-preprod-00103-qjt`, worker `stack32-agent-worker-preprod-00030-4jm`, base `fbqjuqnkemlofklrjeuo`.
- Branche de travail : `codex/builder-reliability-audit`, issue de `origin/preprod`. Les agents créés en production pour cet audit sont des données de test expressément autorisées ; aucun code, schéma, secret, prix, webhook ou déploiement de production ne sera modifié dans cette intervention.
- Profil Chrome vérifié : Synko. Compte demandé et constaté en production : `synko.fr@gmail.com`, Pro, affichage `0 / 5210` crédits (sémantique du compteur à vérifier dans le code).
- Préproduction initialement connectée à un autre compte : déconnexion puis connexion Google Synko réussie, Pro, compteur initial `0 / 1000`.
- Les actions d’envoi, publication externe ou modification de données clients sont exclues des scénarios. Les consentements de connexion à des données sensibles restent explicites.

## Méthode et matrice de tests

| ID | Scénario | Attendu | État initial |
|---|---|---|---|
| S01 | Créer un petit agent de traitement de texte sans compte externe | Bon formulaire, vrai code/spec, test et exécution sur texte fictif | En cours |
| S02 | Poser une question sur l’agent sans demander une modification | Réponse factuelle depuis son état ; aucun faux changement de fichier | À tester |
| S03 | Modifier une seule règle de sortie | Diff limité, outils/mémoire/connexions préservés, résumé fidèle | À tester |
| S04 | Demande d’agent avec plusieurs intégrations explicites | Outils réels du catalogue, paramètres utiles, permissions et connexions claires | À tester |
| S05 | Connecter un outil déjà disponible et exécuter une lecture de test bornée | Bon compte et bon outil ; aucun envoi ou accès élargi implicite | À tester |
| S06 | Crédits, coût des modèles, reprises | Usage facturé selon tokens/coûts réellement enregistrés, sans doublon | À tester |
| S07 | Erreur, annulation, reprise et livraison répétée | Arrêt honnête, reprise idempotente, diagnostic exploitable | À tester |
| S08 | Affichage du chat | Markdown stable, pas de réapparition complète ni faux streaming, actions liées aux changements réels | À tester |
| S09 | Rapide / Standard / Max | Choix persisté et appliqué côté serveur, modèles accessibles et tarification juste | À implémenter après audit |
| S10 | Régression et publication | CI complète puis déploiement préproduction seulement et retest réel | À réaliser |

## Constats initiaux (sans présumer encore la cause)

1. **Observé dans le navigateur de production** : le récapitulatif de Sales Brief Assistant cite « Email Tool / Search Tool / Calendar Tool / CRM Tool », en anglais malgré une demande française, puis les tags `agent.json / graph.json / tools.json` et l’action Open AI Agent. L’état réel des outils n’a pas encore été comparé à ce message.
2. **Constaté dans le code** : les messages non conversationnels passent par un résumé final qui reçoit des noms de fichiers et une timeline assez générale. Les trois fichiers de spec sont réécrits à chaque génération ; une question posée en mode Build peut donc apparaître comme une modification. Hypothèse à reproduire, pas encore conclusion.
3. **Constaté dans le rendu** : le texte frais est d’abord affiché sans Markdown via un typewriter artificiel, puis remplacé par le rendu enrichi. Cette transition peut provoquer le saut de présentation signalé ; mesures et reproduction restent nécessaires.
4. **Configuration réelle API et worker** : intention/utilitaires `gpt-5.6-luna`, conversation/spec/validation `gpt-5.6-terra`, expertise `gpt-5.6-sol`. E2B activé dans les deux environnements. Le code possède déjà des étapes spécialisées de conception, sélection d’outils, code, validation et réparation ; il faut les auditer avant d’ajouter une orchestration concurrente.
5. **Tarification et disponibilité** : modèles GPT-6 documentés officiellement, mais l’accès effectif du projet, la compatibilité des endpoints/outils, le routage et les coûts en cache doivent être vérifiés avant activation. Pas de renommage cosmétique des anciens modèles.

## Plan de correction (priorités provisoires, à confirmer avec les reproductions)

1. Séparer réponse conversationnelle, demande de clarification et modification vérifiée. Résumer uniquement les outils et changements persistés, dans la langue de la demande.
2. Stabiliser la restitution du chat et son défilement ; utiliser les événements réels de progression, sans réécrire un message à chaque rafraîchissement.
3. Corriger les défauts de génération/exécution reproduits et les préserver par des tests ciblés. Réutiliser les étapes spécialisées existantes ; ajouter des contrats/validateurs utiles plutôt que multiplier les appels sans preuve de gain.
4. Ajouter les niveaux de construction en appliquant la sélection à tout le parcours serveur et à la comptabilisation réelle. Garder séparé le modèle personnel utilisé pour exécuter l’agent créé.
5. Rejouer les scénarios, les vérifications du dépôt, publier exclusivement en préproduction, puis retester dans Chrome.

## Sources officielles consultées

- https://developers.openai.com/api/docs/models
- https://developers.openai.com/api/docs/pricing
- https://developers.openai.com/api/docs/guides/reasoning
- https://developers.openai.com/api/docs/guides/streaming-responses

Les résultats, identifiants des seuls agents de test, mesures et corrections seront ajoutés au fil de l’audit. Ne jamais enregistrer de clé, jeton, cookie de session ou contenu client dans ce document.


## Reproduction initiale dans le vrai Chrome

- Agent QA production `9c813095-9cb5-477e-b933-fa1a64b382ae`, build `94a7bafe-174e-43eb-8541-e88b10f3ea4c` (02:45–02:47 UTC). Demande française : compteur de mots/caractères, aucun accès externe. Formulaire d’identité sauté à cause du mot « test ». Réponse anglaise annonçant le nom demandé, mais identité persistée « Untitled agent ». Affichage Draft obsolète jusqu’au rechargement/navigation. **Exécution Live réelle réussie** sur `Bonjour le monde` : `{"mots": 3, "caracteres": 16}` à 02:53 UTC. Aucun message externe envoyé.
- Agent QA préproduction `6cff4151-33e8-4ff9-85e5-de23a87d1c73`, build `c64be059-c78f-49b2-94e8-13ba31eb6f7f` (02:47–02:48 UTC). Même scénario. Validation en échec `REPEATED_FINGERPRINT_NO_PROGRESS`. Les logs prouvent des appels refusés avant le fournisseur : `No module named 'mcp'`. La dépendance est utilisée par LiteLLM pour les requêtes avec outils mais n’était pas déclarée. Le résultat ne prouve donc pas un mauvais code de l’agent.
- Exécution Live préproduction `bb4b0c6c-1de3-43c0-8793-e82f3ec21642` à 02:57 UTC : erreur de fournisseur, circuit OpenAI ouvert après les échecs de construction. Aucun résultat inventé.

## Corrections implémentées sur la branche de fonctionnalité

1. Classification par opérations explicites et mots entiers ; « créer un agent de test » est une création. Les statuts Built/Needs setup sont reconnus comme des agents existants. Les questions d’explication non ambiguës en mode Build sont routées vers le dialogue en lecture seule, sans édition de spec.
2. Langue déduite du message ou de sa demande explicite, avec la langue d’interface en repli. Historique récent borné et isolé par utilisateur/thread. Le contexte expose les outils réellement définis, sans assimiler définition et connexion.
3. Résumé produit depuis les différences de spec persistées, les outils actifs et les résultats de validation. Suppression du résumé fondé sur des noms de fichiers, des tags de fichiers systématiques et du texte brut retapé artificiellement avant sa conversion Markdown. Affichage direct du Markdown avec apparition douce. La progression lit les 80 événements récents, au lieu de rester sur les 80 premiers.
4. Dépendances MCP/OpenAI déclarées. Une validation activée qui échoue ne peut plus être présentée comme une construction réussie après un saut silencieux.
5. Niveaux Builder Rapide / Standard / Max, choix validé côté API et sauvegardé dans le run, restauré à chaque reprise. Candidats : GPT-6 Luna / GPT-6.1 Sol / GPT-6 Astra. Ils ne sont affichés que si le drapeau de cet environnement est actif et si le compte fournisseur les expose. L’exécution des agents avec leur modèle/clé personnels reste séparée. **Activation et validation réelles encore à effectuer en préproduction.**
6. Frontière Responses pour GPT-6 : rôles conservés, appels/résultats d’outils corrélés, alias sûrs pour les identifiants contenant des points, raisonnement chiffré conservé temporairement pendant les appels d’outils, aucune conservation distante demandée. Aucun repli silencieux vers un ancien modèle lorsque l’utilisateur choisit un niveau.
7. Compteurs réels préservés pour les réponses structurées ; coût calculé selon modèle, tokens et cache. Budgets imbriqués partagés, identifiants de consommations distincts entre continuations, attente des écritures de consommation avant la fin du traitement. Le choix Max ne reçoit pas un multiplicateur forfaitaire de crédits.

## Vérifications locales avant publication

- Backend : **1 361 tests passés** (dont 37 nouvelles régressions), Ruff réussi ; Bandit aucun problème de sévérité moyenne/haute.
- Web : **305 tests unitaires passés**, typage réussi ; lint 0 erreur et 42 avertissements préexistants.
- Build, tests navigateur complets, CI, publication et retest préproduction : à exécuter. Ces tests unitaires ne constituent pas une validation des modèles chez le fournisseur ni des intégrations OAuth réelles.
