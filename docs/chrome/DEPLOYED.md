# Déploiement réel du 29 septembre 2026

## Actualisation après essais dans Chrome (29 septembre, 18 h 40 Paris)

- Correctif de reconnaissance de Chrome comme capacité native : [PR #16](https://github.com/SYNKO-COM/stack32/pull/16), intégré à `preprod`. Le builder ne demande plus de choisir une application SaaS pour « Chrome ».
- Correctif des exécutions en file : [PR #17](https://github.com/SYNKO-COM/stack32/pull/17), commit intégré `d0e12f3a2d5bbb87822c238bd4d6c989093b61c6`. L'ID d'installation est transmis au runtime ; une conversation d'abonné utilise sa version publiée épinglée ; une dépublication entre mise en file et exécution arrête la tâche.
- CI des deux PR : tous les contrôles réussis. Après le second correctif, Cloud Build `1bdce11f-eee1-4d04-bb33-171568bfe9a5` est **SUCCESS** ; API `stack32-agent-api-preprod-00098-6pz` et worker `stack32-agent-worker-preprod-00027-5d4` sont Ready, `CHROME_ENABLED=true` sur les deux.
- Dans le vrai Chrome de l'utilisateur, le formulaire Outils montre Chrome coché par défaut et explique que la capacité ne donne aucun accès. Un agent de rédaction créé sur préprod a rédigé sans demander Chrome. Le builder a ensuite accepté les instructions de navigation sans confondre Chrome avec une intégration.
- Agent de test **Rédacteur préprod temporaire** publié uniquement sur [le domaine préprod](https://pre-prod-659874458xx.stack32.com/@klorv/redacteur-preprod-temporaire) ; sa page publique s'ouvre. Une tâche de lecture de `#task-region` a renvoyé le lien d'appairage et « No browser action has run ». Le journal du worker de cette exécution contient `tools=6`, ce qui confirme que les outils sont désormais présents dans la composition du modèle.
- L'utilisateur a chargé et activé localement l'extension non empaquetée **Stack32 Chrome BETA 0.1.0**, d'après sa capture. L'onglet fictif `/browser/test` a été rouvert ; il affiche toujours « No action performed ».

**Toujours non validé dans le vrai navigateur :** saisie du code dans la fenêtre de l'extension, geste `activeTab`, autorisation de la lecture, retour du résultat à l'agent, puis révocation. Le clic sur l'icône et la confirmation du contenu appartiennent à l'utilisateur ; ne pas assimiler le chargement de l'extension à une session autorisée. La soumission Chrome Web Store reste à faire.

## Résultat

Fonctionnalité déployée et activée **uniquement en préproduction**. L’extension 0.1.0 est disponible en ZIP à charger localement. Aucune publication Chrome Web Store, aucune fusion dans `main`, aucune migration ou configuration de production.

Le propriétaire a explicitement autorisé le 29 septembre l’utilisation des clés live fournisseurs dans les services préprod. Le garde-fou autorise exactement les neuf références historiques identifiées ; il ne permet pas de partager la base, l’authentification Supabase, le chiffrement ou le token de service interne.

## Identifiants vérifiables

- PR intégrée : https://github.com/SYNKO-COM/stack32/pull/15, base **preprod**.
- Commit intégré et déployé : `7a1c9888b447a05465a64488f410d1b1d6b68ada`.
- CI : https://github.com/SYNKO-COM/stack32/actions/runs/36575956072 ; sécurité : https://github.com/SYNKO-COM/stack32/actions/runs/36575956100. Tous les jobs réussis.
- Supabase : `fbqjuqnkemlofklrjeuo`. Dry-run limité à la migration `20260928000001_browser_sessions.sql`, puis application et vérification dans l’historique distant réussies.
- Cloud Build : `f5ddb5f4-444b-4ade-a152-7ae11b5aa2cf`, **SUCCESS**, terminé à 13:46:55 UTC. Pipeline `cloudbuild.preprod.yaml`.
- API activée et Ready : `stack32-agent-api-preprod-00094-hrn`.
- Worker activé et Ready : `stack32-agent-worker-preprod-00025-pk5`.
- `CHROME_ENABLED=true` vérifié sur les deux services ; région `europe-west1`, projet `stack32`.
- Vercel : projet `prj_Q1gLhC7rGTQwFWTDwj3lYjry68Xs` / `stack32-preprod`, déploiement `dpl_EotWHtMLys1Kg23eC5xwGDGC82mZ`, **READY**.
- Domaine vérifié : https://pre-prod-659874458xx.stack32.com . Les variables Vercel visent la base/API préprod et `BILLING_MODE=mock`. Les claims des clés Supabase du Web correspondent à `fbqjuqnkemlofklrjeuo`.
- ZIP public préprod, réponse HTTP 200 : https://pre-prod-659874458xx.stack32.com/downloads/stack32-chrome-preprod-0.1.0.zip . SHA-256 servi identique au fichier testé : `bf473703409a294ad1d52cd746dc0cd86af933a4a6935bdca2e219543e3e6597`.

Les déploiements Git automatiques Vercel des branches `codex/chrome-preprod` et `preprod` sont désactivés dans leur configuration de branche : le projet de production est relié à GitHub et pourrait sinon créer des previews. Aucun réglage du projet Vercel de production n’a été modifié. Les déploiements préprod restent explicitement exécutés via CLI avec le project ID préprod.

## Tests réellement passés

- 1 347 tests Python ; 267 tests Web ; 17 tests Chromium ; 5 tests du contrôle de configuration.
- CI : lint/typecheck/build, migration complète Supabase, pgTAP, types DB régénérés conformes, scans secrets/dépendances/conteneur et validation Terraform sans déploiement.
- E2E Web sur Supabase local CI : **3 réussis, 1 ignoré** (test existant). Ces tests ne constituent pas un parcours Chrome connecté complet.
- Après déploiement, essais contre la **vraie API et la vraie base préprod**, à 13:49:52 UTC, avec trois nouveaux comptes synthétiques `example.invalid`, supprimés en fin de test :
  1. Un autre utilisateur et le créateur ne peuvent pas ouvrir de session sur l’installation du consommateur.
  2. Appairage authentifié et code à usage unique ; seconde utilisation refusée.
  3. L’appareil du second utilisateur ne reçoit aucune commande du premier.
  4. Queue Postgres réelle, claim unique, validation d’exécution et retour de résultat.
  5. Révocation : appareil refusé et commandes supprimées en cascade.
  6. Expiration : appareil refusé.
  7. Capacité désactivée : création de session refusée.
- La page `/browser/test` a été ouverte et inspectée dans le Chrome de l’utilisateur sur le domaine déployé.

**Portée précise : l’appareil des essais API était simulé.** Le résultat envoyé portait explicitement la mention de fixture de transport. Aucune lecture/action réelle dans Chrome ni exécution avec modèle réel n’est déduite de ces résultats. Aucun message externe envoyé et aucun compte client utilisé.

## Pour tester maintenant

1. Télécharger le ZIP ci-dessus et le décompresser.
2. Dans `chrome://extensions`, activer le mode développeur puis Charger l’extension non empaquetée ; sélectionner le dossier contenant `manifest.json`.
3. Sur le site préprod, créer un agent avec Navigateur Chrome activé. Les anciens agents ne sont pas automatiquement activés ; utiliser Structure puis republier si nécessaire.
4. Demander une tâche sur `https://pre-prod-659874458xx.stack32.com/browser/test`, par exemple lire `#task-region` puis saisir un texte fictif dans `#message`.
5. Suivre le lien proposé par l’agent, créer le code, ouvrir l’onglet de test, cliquer l’icône Stack32, coller le code et autoriser. Garder la page de connexion et la fenêtre de contrôle ouvertes ; demander ensuite à l’agent de continuer.
6. Confirmer chaque extrait à transmettre et chaque interaction ; vérifier le résultat après exécution. Le bouton `#send-test` ne fait qu’une simulation locale.

## Ce qui reste

- Vérification complète agent réel → demande d’accès → geste `activeTab` → extension → résultat confirmé, ainsi que les scénarios manuels de `VALIDATION.md`.
- Téléversement et configuration **Private** dans le dashboard développeur Chrome Web Store. Le compte existe d’après le propriétaire et sa capture ; l’outil navigateur refuse l’automatisation de cette page. Le ZIP, la politique, les textes et les instructions de revue sont prêts dans `STORE.md`.
- Captures de session active et confirmation après cet essai réel ; accès reviewer et liste des testeurs à renseigner dans le dashboard ; validation Google non obtenue et non présumée.
- Aucun lancement public autorisé. Celui-ci demande une décision distincte et les vérifications de sécurité/produit listées dans `DEPLOYMENT.md`.
