# Stack32 Chrome BETA 0.1.0 — pré-production

> Mise à jour du 29 septembre : le propriétaire autorise explicitement les clés fournisseurs live en préproduction. Le contrôle autorise uniquement les neuf références connues ; base, JWT, chiffrement, token interne et cibles de déploiement restent préprod. Les blocages historiques ci-dessous sont conservés comme état antérieur ; le déploiement est en cours. Le dashboard Chrome Web Store est ouvert selon le propriétaire, mais l’outil refuse son automatisation (« The extensions gallery cannot be scripted »).


État au 29 septembre 2026 : implémentation et package locaux ; **aucun déploiement, aucune migration distante, aucune fusion et aucune soumission Google effectués**. L’essai complet connecté à Stack32 reste bloqué par l’isolation des secrets de pré-production. Voir [validation](VALIDATION.md), [déploiement](DEPLOYMENT.md) et [dossier Chrome Web Store](STORE.md).

## Cibles identifiées avant les modifications

| Élément | Cible de pré-production vérifiée |
| --- | --- |
| Dépôt et branche de base | `SYNKO-COM/stack32`, `preprod`, base `e9690538e7a220dcc82b9b312fe91fe8c326b834` |
| Branche de fonctionnalité | `codex/chrome-preprod` |
| Web | `https://pre-prod-659874458xx.stack32.com` |
| Supabase | `fbqjuqnkemlofklrjeuo`, `https://fbqjuqnkemlofklrjeuo.supabase.co` |
| Cloud Run | projet `stack32`, région `europe-west1`, `stack32-agent-api-preprod` et `stack32-agent-worker-preprod` |
| API de l’extension | `https://stack32-agent-api-preprod-spxecrm6bq-ew.a.run.app` |
| Queue | `stack32-runs-preprod` |
| Vercel | `stack32-preprod`, `prj_Q1gLhC7rGTQwFWTDwj3lYjry68Xs`, équipe `team_C7cEqam67wmnaZG8xaO876rz` |

Le checkout d’origine était sur `main`. Il n’a pas été réutilisé pour coder. Son lien Supabase local pointe vers la production : ne jamais utiliser `supabase db push --linked` depuis ce checkout. Les secrets dédiés à Supabase préprod sont distingués par leurs références, sans utilisation de leurs valeurs pour ces tests.

## Produit et architecture

Quatre états distincts : la **capacité** dans la définition de l’agent, l’**extension installée** localement, le **consentement pour un onglet/site**, puis la **session active** liée à un utilisateur, une installation et une conversation. Aucun de ces états ne remplace les autres.

- Le premier élément du formulaire Outils est « Navigateur Chrome », activé par défaut pour un nouvel agent. Aucun téléchargement, compte navigateur ou permission n’est requis pour construire/publier ou pour rédiger. Les anciennes spécifications sans champ restent sans outils Chrome ; aucune activation rétroactive.
- `chrome_enabled` est conservé dans les versions. Une valeur absente (`null`) se distingue d’un refus explicite (`false`). Le panneau Structure de l’agent permet aussi de modifier cette capacité ; la désactivation bloque les prochaines commandes des installations existantes. Une activation d’un agent publié nécessite une nouvelle publication. Une ancienne version épinglée désactivée reste désactivée jusqu’à sa mise à jour.
- Le runtime préfère rédaction/calcul, recherche publique et intégrations directes. Seul `chrome_request_access` est exposé sans session. Une tâche qui le demande produit une interruption et un lien `/browser`, sans lecture ni action. Après appairage, demander à l’agent de continuer dans la même conversation reconstruit ses outils autorisés.
- Le serveur réutilise l’authentification Stack32, `InstallationService`, les versions d’agent et `live_threads`. Chaque opération vérifie l’utilisateur consommateur, son installation, sa conversation, la capacité courante et la version épinglée. La connexion du créateur et `approved_tool_ids` ne donnent jamais l’autorité Chrome.
- Transport : commandes structurées en Postgres, polling depuis une fenêtre d’extension, aucune connexion entrante locale. Le JWT du compte reste côté Web/API. Code d’appairage aléatoire à usage unique (256 bits, 2 minutes), jeton appareil aléatoire (hash en DB, valeur uniquement en mémoire de l’extension). Session 15 minutes maximum, présence Web 30 secondes, présence appareil 15 secondes, commande 60 secondes, 30 commandes maximum.
- Les tables `browser_sessions` et `browser_commands` ont RLS et aucun droit direct pour `anon`/`authenticated`. Le service contrôle l’identité à chaque requête ; la RPC d’enqueue verrouille la session et borne le nombre de commandes. Aucun abonnement créateur ne lit les données du navigateur de l’abonné.
- `activeTab` est accordé par le clic réel sur l’icône pour l’onglet voulu. Pas de permission permanente sur les sites cibles. L’extension ne demande que `activeTab`, `scripting` et l’origine de transport préprod. Le code injecté est empaqueté, exécuté dans le monde isolé, sans code distant/interpréteur de code de modèle.
- Lecture limitée à un sélecteur ciblé, texte visible et quelques descripteurs de contrôles. Pas de capture de page entière, cookies, historique, mots de passe, captures d’écran, autres onglets ou collecte autonome. Une lecture explicite d’un champ textuel autorisé permet de vérifier une saisie.
- **Toute lecture et interaction** exige une confirmation dans la fenêtre de l’extension. Une lecture affiche localement l’extrait exact et ne le transmet au serveur qu’après accord, avec nouvelle vérification du document et du contenu. Une page hostile ne peut donc pas déclencher une lecture supplémentaire silencieuse. Les formulaires inspectables affichent les valeurs exactes, dont destinataires/contenu, destination HTTP et bouton utilisé. Le même aperçu est recalculé avant exécution et attaché au document d’origine. Les formulaires avec champs cachés, fichiers, champs sensibles, contenu éditable ou sélections multiples et les boutons opaques nécessitent une intervention manuelle.
- Les changements de domaine, fermeture d’onglet/fenêtre, refus, fin de session, désactivation et retrait d’accès arrêtent les nouvelles commandes. Pas de retry automatique d’un effet potentiel ; un clic ne prouve pas une réussite. Une action déjà envoyée ne peut pas être annulée rétroactivement. Un logout distant peut n’être détecté qu’à l’échec du heartbeat ; la fenêtre Web doit rester ouverte.
- Les instructions présentes sur une page restent des données non fiables. Elles ne changent jamais les permissions, le site, l’installation ou les limites. Les interactions supplémentaires exigent encore le contrôle humain. Aucun mécanisme ne peut garantir la sémantique interne d’un site hostile ou de son JavaScript ; refuser les conséquences non vérifiables et utiliser une intégration directe ou le mode manuel.

## Utilisation après levée des blocages

1. Créer un agent avec Chrome activé et un utilisateur de test avec sa propre installation.
2. Donner une tâche nécessitant le site connecté. Ouvrir le lien proposé par l’agent et rester connecté à ce compte de préprod.
3. Télécharger le ZIP depuis `/browser`, le décompresser et charger le dossier dans `chrome://extensions` → Mode développeur → Charger l’extension non empaquetée. Après distribution privée, utiliser le lien privé du Store à la place.
4. Créer le code pour le site exact ; ouvrir l’onglet souhaité, cliquer l’icône Stack32, coller le code puis autoriser. Garder les deux fenêtres ouvertes.
5. Revenir à la conversation et demander de continuer. Vérifier chaque aperçu avant confirmation. « Arrêter » et « Retirer l’accès » invalident tous deux cette session ; une reprise nécessite un nouveau code.
6. Le site Stack32 lui-même est limité à `/browser/test`, page synthétique sans envoi. Aucune session client réelle ne doit être utilisée pour les essais.

## Sources officielles consultées

- [Permissions et demandes à l’exécution](https://developer.chrome.com/docs/extensions/reference/api/permissions)
- [activeTab et geste utilisateur](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab)
- [Scripts de contenu et mondes isolés](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)
- [Exigences MV3 et code distant](https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements)
- [Règles du Chrome Web Store](https://developer.chrome.com/docs/webstore/program-policies/policies)
- [Publication](https://developer.chrome.com/docs/webstore/publish/) et [distribution privée](https://developer.chrome.com/docs/webstore/cws-dashboard-distribution)
- [Images et captures de fiche](https://developer.chrome.com/docs/webstore/images)

Le code et les déclarations sont préparés selon ces documents. La conformité et l’acceptation par Google ne sont pas présumées.
