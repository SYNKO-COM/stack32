# Intégration et déploiement préprod uniquement

## Blocage constaté, pas une demande de dérogation

Le 29 septembre 2026, les métadonnées de **l’API et du worker préprod** indiquent ces références :

| Variable | Référence actuelle à remplacer ou retirer |
| --- | --- |
| OPENAI_API_KEY | stack32-production-openai-api-key |
| XAI_API_KEY | stack32-production-xai-api-key |
| ANTHROPIC_API_KEY | stack32-production-anthropic-api-key |
| E2B_API_KEY | stack32-production-e2b-api-key |
| WEB_SEARCH_API_KEY | stack32-production-web-search-api-key |
| PIPEDREAM_CLIENT_ID | stack32-production-pipedream-client-id |
| PIPEDREAM_CLIENT_SECRET | stack32-production-pipedream-client-secret |
| PIPEDREAM_PROJECT_ID | stack32-production-pipedream-project-id |
| SENTRY_DSN | stack32-production-sentry-dsn |

Les seuls secrets préprod listés étaient ceux du token interne, du chiffrement, du rôle Supabase, de l’URL DB et du mot de passe DB. Les fournisseurs nécessitent des identifiants/projets de test réellement séparés ; **renommer ou recopier les valeurs de production ne constitue pas une isolation**. Le projet Pipedream et les connexions doivent aussi être distincts. Aucun secret de production n’a été lu ni utilisé pour la validation locale. Aucun appel de modèle hébergé n’a été effectué.

Le code garde `CHROME_ENABLED=false` par défaut. Le pipeline préprod inclut désormais un contrôle des deux services, de leurs domaines/JWT et de toutes leurs références de secrets, avant tests/build/déploiement. Son refus avec la configuration actuelle a été vérifié. Ce contrôle ne crée aucun secret.

## Étapes restantes, dans cet ordre

1. Fournir/créer les comptes et secrets dédiés aux fournisseurs requis et à Pipedream/Sentry, sous des références `stack32-preprod-*`, puis remplacer les références **uniquement** sur les deux services préprod. Retirer les fournisseurs inutilisés nécessite de vérifier leur comportement de repli. Auditer aussi les variables du projet Vercel préprod sans réutiliser ses valeurs si leur origine est ambiguë.
2. Relire les métadonnées, sans accéder aux valeurs de secrets :

   ```sh
   umask 077
   gcloud run services describe stack32-agent-api-preprod --project=stack32 --region=europe-west1 --format=json > /tmp/chrome-api.json
   gcloud run services describe stack32-agent-worker-preprod --project=stack32 --region=europe-west1 --format=json > /tmp/chrome-worker.json
   python3 scripts/check-chrome-preprod.py /tmp/chrome-api.json /tmp/chrome-worker.json
   ```

3. Rebaser la branche de fonctionnalité sur le `preprod` distant si celui-ci a changé, examiner les conflits, puis exécuter les contrôles du dépôt et le protocole local de `VALIDATION.md`. Lancer la pile Supabase locale isolée pour les tests E2E Web complets et la régénération des types DB. Ne pas utiliser le lien Supabase du checkout d’origine. Les nouveaux types DB ont été ajoutés manuellement et vérifiés par TypeScript en attendant cette régénération.
4. Vérifier les déclencheurs GitHub/Vercel avant de pousser : aucun hook ne doit construire/déployer cette branche avec des identifiants de production. Créer une PR avec **base `preprod`**, jamais `main`. Après contrôles, intégrer exclusivement dans `preprod`.
5. Dans un checkout dédié à `preprod`, préparer une connexion DB à la référence `fbqjuqnkemlofklrjeuo` depuis les secrets préprod identifiés. Vérifier l’hôte et le projet en mémoire, sans afficher mot de passe ni URL complète. Faire le dry-run des migrations ; examiner toute migration supplémentaire avant application. Appliquer `20260928000001_browser_sessions.sql` seulement sur cette base, puis vérifier tables, RLS et droits. Ne pas utiliser `--linked` sans une vérification préalable du project-ref ; ne pas mettre l’URL authentifiée dans l’historique shell.
6. Déployer avec le processus existant :

   ```sh
   gcloud builds submit --project=stack32 --config=cloudbuild.preprod.yaml .
   ```

   Déployer le Web uniquement avec `VERCEL_PROJECT_ID=prj_Q1gLhC7rGTQwFWTDwj3lYjry68Xs` et `VERCEL_ORG_ID=team_C7cEqam67wmnaZG8xaO876rz`, après audit de ses variables. Le `--prod` de Vercel, dans ce processus, désigne le slot stable **du projet isolé `stack32-preprod`**. Vérifier le projet avant la commande et l’alias `pre-prod-659874458xx.stack32.com` après celle-ci.
7. Avec les secrets isolés et la migration vérifiée, activer `CHROME_ENABLED=true` **sur les deux services préprod seulement**. Le garde-fou applicatif exige l’origine Web, le projet Supabase, l’issuer et JWKS préprod et des JWT vérifiés. Créer des comptes/agents/installations de test exclusivement préprod, sans connexions clients. Exécuter toute la matrice manuelle.
8. Ne préparer la soumission privée qu’après validation réelle. Utiliser `STORE.md`, compléter les preuves, l’accès testeur/reviewer et la vérification du compte développeur.

## Retour arrière préprod

Désactiver `CHROME_ENABLED` sur les deux services préprod : les prochaines vérifications refusent les commandes. Fermer les fenêtres de contrôle et vérifier que les sessions ne produisent plus d’effets. Restaurer uniquement les révisions API/worker et le déploiement Vercel préprod précédents si nécessaire. La migration est additive ; laisser les tables avec leurs droits restreints évite une suppression de données pendant l’investigation. Une action déjà exécutée sur un site ne peut pas être annulée par ce retour arrière.

## Avant un lancement public éventuel

Une nouvelle autorisation explicite de mise en production est nécessaire. Prévoir une revue sécurité avec essais adverses, une politique de rétention complète incluant les traces de conversation, une stratégie de nettoyage régulier, quotas/observabilité sans données sensibles, vérification des sites officiellement supportés, politique de confidentialité publiée, validation Store, support utilisateur et procédure de révocation. Cette version est volontairement verrouillée aux cibles préprod et ne peut pas simplement être pointée vers la production par une variable d’environnement.
