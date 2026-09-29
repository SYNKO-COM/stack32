# Dossier Chrome Web Store — distribution privée seulement

> État actuel : intégré et déployé en préproduction le 29 septembre 2026 ; clés fournisseurs live explicitement autorisées par le propriétaire. Voir [le compte rendu de déploiement](DEPLOYED.md) pour les preuves et les vérifications encore manuelles.


## État

Version : **0.1.0**. Nom : **Stack32 Chrome BETA**. Package : `apps/web/public/downloads/stack32-chrome-preprod-0.1.0.zip`. Génération reproductible : `python3 scripts/package-chrome.py`. Le ZIP ne contient ni tests, ni source map, ni secrets, ni code téléchargé à l’exécution.

Aucun article Store créé, soumis ou publié. Le propriétaire a créé son compte développeur et fourni une capture du dashboard connecté. L’outil Chrome refuse cependant ce dashboard avec « The extensions gallery cannot be scripted » ; le téléversement et le choix Private doivent être effectués manuellement. La liste des testeurs et les éventuels contrôles supplémentaires de Google ne sont pas vérifiés. Aucun identifiant Google ni validation Google n’est présumé. Les essais API/DB préprod sont réussis ; le parcours agent + extension dans un onglet réel doit encore être vérifié avant soumission.

## Textes prêts à utiliser

**Description courte FR** : Autorisez temporairement un onglet choisi pour votre agent Stack32. Chaque lecture et interaction demande confirmation.

**Short description EN** : Give your Stack32 agent temporary access to a tab you choose. Every read and interaction requires confirmation.

**Description FR** :

THIS EXTENSION IS FOR BETA TESTING.

Stack32 Chrome BETA permet à un agent Stack32 de vous aider dans un onglet que vous choisissez. Version privée réservée à l’environnement de pré-production Stack32 et aux comptes de test.

Installez l’extension seulement si une tâche nécessite votre navigateur. Depuis Stack32, créez un code temporaire pour le site demandé, cliquez sur l’icône de l’extension dans l’onglet concerné et autorisez la session. L’extension affiche le nom de l’agent, le site et l’expiration. Vous pouvez arrêter la session ou retirer l’accès à tout moment.

Les lectures portent sur les éléments utiles à votre tâche et affichent le texte localement avant votre accord pour le transmettre. Toute saisie, navigation ou interaction proposée demande une confirmation locale. Les formulaires compatibles affichent les valeurs exactes, dont le destinataire et le contenu, avant envoi. Les interfaces dont les conséquences ne peuvent pas être inspectées nécessitent une action manuelle. Une action déjà exécutée n’est pas annulée par le retrait d’accès.

Pas d’accès permanent à tous les sites, pas de collecte d’historique, de cookies ou de mots de passe. Pas de contournement de CAPTCHA, de double authentification ou des limites des sites. La session dure au maximum 15 minutes et nécessite de garder ouvertes la page de connexion Stack32 et la fenêtre de contrôle.

Compte Stack32 de pré-production requis. Cette version n’est pas destinée aux comptes ou données clients réels.

**Description EN** :

THIS EXTENSION IS FOR BETA TESTING.

Stack32 Chrome BETA lets your Stack32 agent assist with a tab you choose. This private version is restricted to Stack32 preproduction and test accounts.

Install it only when a task needs your browser. Create a temporary pairing code in Stack32 for the requested site, click the extension icon in that tab and authorize the session. The control window displays the agent, site and expiry, with Stop and Revoke access controls.

Reads cover relevant page regions and require your approval of the locally displayed text before sharing it. Every proposed fill, navigation or interaction requires local confirmation. Supported forms show exact values, including recipients and message content, before submission. Interfaces whose consequences cannot be inspected require manual action. Revocation cannot undo an already dispatched action.

No permanent access to all sites, browsing-history collection, cookies or passwords. No CAPTCHA, two-factor authentication or site-limit bypass. Sessions last at most 15 minutes and require both the Stack32 connection page and the extension control window to stay open.

A Stack32 preproduction account is required. This version is not intended for real customer accounts or data.

## Permissions et finalité unique

Finalité unique : permettre à l’utilisateur de confier à son agent Stack32 une tâche limitée dans l’onglet qu’il autorise, avec confirmation locale avant interaction.

| Permission | Justification pour la revue |
| --- | --- |
| `activeTab` | Accès temporaire à l’onglet choisi par clic utilisateur sur l’icône ; aucun octroi global à l’installation. |
| `scripting` | Exécuter uniquement la fonction empaquetée de lecture/saisie/navigation/formulaire, dans le monde isolé du document autorisé. Aucun eval, interpréteur ou script distant. |
| Hôte `https://stack32-agent-api-preprod-spxecrm6bq-ew.a.run.app/*` | Appairage du compte, présence de la session et transport HTTPS des commandes structurées/résultats. Ne donne pas accès permanent aux sites cibles. |

Aucune permission `cookies`, `history`, `tabs`, `debugger`, `webRequest`, `storage`, `<all_urls>` ou `externally_connectable`. L’API `tabs` n’est utilisée que pour le suivi de l’onglet choisi, avec les informations accordées par `activeTab`.

## Déclarations de données à reporter et vérifier dans le dashboard

- Données transférées : site autorisé ; code/jeton éphémère d’appairage ; extraits ciblés et limités de texte ; résultats de lecture/interaction. Les commandes peuvent contenir un texte à saisir. Le backend associe ces données au compte, à l’agent et à l’installation pour assurer l’isolation.
- Catégories : **contenu des sites**, **activité utilisateur** (actions explicitement demandées), **informations d’authentification** (jeton de session Stack32 uniquement). Les extraits explicitement demandés peuvent aussi contenir des **informations personnellement identifiables**, des **communications personnelles**, des **informations financières** ou de **santé** selon le site. Déclarer ces catégories possibles si ces usages restent admis dans la version soumise ; ne pas certifier une absence que le lecteur de texte générique ne garantit pas. Aucun cookie, mot de passe ou moyen d’authentification du site n’est collecté.
- Usages : fonctionnalité demandée et contrôle d’accès. Pas de vente, publicité, profilage, revente à des courtiers ou utilisation pour des décisions de crédit. Les extraits sont transmis au fournisseur de modèle choisi pour exécuter la tâche, selon les réglages Stack32 ; ils peuvent figurer dans la conversation.
- Transport HTTPS. Jeton appareil conservé en mémoire locale seulement ; empreintes en base. Commandes temporaires supprimées après consommation/révocation ; expiration des autorisations indépendante du nettoyage, qui est opportuniste lors de la création d’une session suivante. Données de conversation soumises à la conservation et suppression du compte.
- L’utilisateur peut refuser une interaction, arrêter/révoquer la session, fermer les fenêtres ou désinstaller l’extension. Aucun nouvel effet autorisé après détection ; les effets déjà envoyés ne sont pas annulables par ces contrôles.
- Code distant : **non**. Le serveur envoie des objets d’actions prédéfinis et des chaînes de texte, jamais du JavaScript à exécuter.

Politique préparée : `apps/web/app/browser/privacy/page.tsx`. URL de la politique déployée en préproduction : `https://pre-prod-659874458xx.stack32.com/browser/privacy`. Le responsable de traitement/contact est renvoyé vers la politique existante `/legal/privacy` ; vérifier ce contact avant de certifier la fiche. Ne pas remplacer ce lien par un domaine de production pour les essais.

## Images

- Icônes incluses : `apps/chrome-extension/icons/{16,48,128}.png`.
- Capture réelle de l’écran initial de l’extension chargée dans Chromium isolé : `docs/chrome/screenshots/01-connect.png`, 1280×800. Le domaine affiché est une fixture locale synthétique. Ce n’est pas une preuve d’appairage réussi.
- Après le test connecté : ajouter une capture de la session active affichant l’agent/site et une capture de la confirmation du message fictif `test@example.invalid`. Ne jamais inclure un code d’appairage utilisable, un jeton ou des données personnelles. Captures non produites pour l’instant, car la validation distante est bloquée.
- Prévoir les éventuels visuels promotionnels demandés par le dashboard au moment de la soumission. Aucun faux écran connecté ou badge de validation Google n’a été créé.

## Instructions privées pour l’équipe de revue

1. Fournir un compte reviewer **de pré-production** avec les droits et le modèle de test nécessaires via le canal privé prévu par Google. Ne jamais mettre un mot de passe dans Git ou la description publique. Les identifiants reviewer restent à créer ; aucun compte fictif n’est présenté comme existant.
2. Accéder au domaine préprod, ouvrir l’agent de démonstration autorisé, dans sa propre installation. Demander : « Sur la page de test Stack32, lis uniquement `#task-region`, puis remplis `#message` avec Bonjour test. Demande ma confirmation et vérifie le résultat. »
3. Ouvrir le lien de connexion proposé, créer un code, ouvrir `https://pre-prod-659874458xx.stack32.com/browser/test`, cliquer l’icône, coller le code et autoriser l’onglet. Garder les deux fenêtres ouvertes, revenir à la conversation et demander de continuer.
4. Pour l’envoi fictif : demander de cliquer `#send-test`. Vérifier que l’extension affiche `test@example.invalid` et le contenu exact. Refuser une première fois : la page ne doit pas changer. Refaire une session de test, confirmer : seule la page locale doit afficher `SIMULATED ONLY`. Aucun message n’est envoyé.
5. Vérifier arrêt, expiration et changement de domaine suivant `VALIDATION.md`.

## Soumission privée restante

Vérifier inscription, e-mail et exigences de sécurité du développeur dans le dashboard officiel ; téléverser le ZIP ; renseigner description, catégories, confidentialité, permissions, captures et instructions de test ; choisir **Private** et une liste nominative de testeurs ou le groupe autorisé. **Unlisted n’est pas privé.** Contrôler la visibilité avant soumission. La distribution privée peut aussi nécessiter une revue Google. Ne pas choisir Public, ne pas inventer de validation ni publier une version visant la production.
