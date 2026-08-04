# Stack32 — Product Requirements Document (PRD)

**Version :** 1.0  
**Statut :** Spécification MVP  
**Produit :** Stack32  
**Domaine :** Stack32.com  
**Type :** SaaS web de vibe coding pour agents IA  
**Langue principale du produit :** anglais, avec infrastructure i18n prête pour le français  
**Document destiné à :** développement avec Cursor, design produit, backend IA et déploiement

---

## 1. Résumé exécutif

Stack32 permet à une personne non technique de créer un agent IA fonctionnel en écrivant simplement ce qu’elle souhaite obtenir.

La promesse principale est :

> **Describe the agent you need. Build it. Use it immediately.**

L’utilisateur ne code rien, ne déplace aucun bloc et ne configure aucun workflow de type n8n. Il échange avec le Builder de Stack32 comme avec Cursor ou Claude Code. Stack32 comprend son besoin, construit une structure d’agent, la valide, la teste et rend immédiatement l’agent disponible dans l’onglet **Live**.

Le MVP doit valider une hypothèse simple :

> Un utilisateur est-il prêt à payer pour écrire une phrase, obtenir un agent IA utilisable immédiatement, puis l’améliorer en quelques prompts ?

L’objectif n’est pas d’obtenir un agent parfait au premier prompt. Le produit doit néanmoins générer une première version visible et raisonnablement fonctionnelle dès le premier message, puis atteindre un résultat satisfaisant en quatre à cinq prompts maximum dans la majorité des cas.

---

## 2. Décisions produit déjà validées

- Stack32 est un SaaS web uniquement.
- Le produit est développé dans une nouvelle architecture. Aucun backend de Klorv ne doit être repris.
- Seuls l’UI, l’UX, les animations, la direction artistique, les composants visuels et les principes de navigation de Klorv servent de référence.
- La base de données, l’authentification, le stockage et la recherche vectorielle utilisent Supabase.
- Le frontend utilise Next.js, React et TypeScript.
- Le moteur agentique principal est développé en Python.
- Les agents créés par les utilisateurs ne sont pas, dans le MVP, des projets Python indépendants.
- Chaque agent est une configuration structurée et versionnée, appelée **AgentSpec**, exécutée par un runtime commun.
- Le Builder de Stack32 fonctionne comme un agent de code spécialisé dans la création d’agents IA.
- L’interface principale contient une barre latérale avec les agents et une grande zone centrale avec trois vues : **Build**, **Live** et **Structure**.
- Il n’existe pas de panneau permanent de preview à droite.
- Le paiement est géré via Whop.
- Le MVP ne doit pas devenir un clone de n8n, Make ou Zapier.

---

## 3. Référence UI/UX Klorv

### 3.1 Éléments à conserver ou réinterpréter

La nouvelle interface Stack32 doit reprendre l’identité visuelle et les comportements UX suivants de Klorv :

- thème sombre premium ;
- fond presque noir avec nuances violet profond ;
- arrière-plan pointillé discret ;
- effets de verre, flou, transparence et bordures blanches très faibles ;
- cartes très arrondies ;
- lueurs violettes modérées ;
- typographie Geist pour l’interface ;
- Geist Mono pour les éléments techniques ;
- Caveat uniquement pour une éventuelle séquence d’introduction manuscrite ;
- animations Framer Motion fluides et lentes ;
- navbar flottante ;
- grand hero centré ;
- grande zone de prompt centrale ;
- transitions fluides entre landing page, authentification, onboarding et Builder ;
- onglets dont seul l’onglet actif affiche son libellé en évidence ;
- boutons blancs ou verre sombre, avec accent violet uniquement sur les actions importantes ;
- mêmes principes de responsive design et de réduction des animations.

### 3.2 Éléments de Klorv pouvant être réutilisés visuellement

Peuvent être copiés, adaptés ou reconstruits :

- design tokens et variables CSS ;
- composants UI génériques ;
- styles des boutons, cartes, menus, modales et champs ;
- `Logo`, en remplaçant l’identité Klorv par Stack32 ;
- fond animé ;
- hero ;
- prompt box ;
- navbar ;
- modale d’authentification ;
- onboarding en trois étapes ;
- animation d’introduction à l’onboarding ;
- topbar de l’éditeur ;
- transitions d’entrée vers l’éditeur ;
- composants de profil, menu utilisateur et paywall ;
- gestion du thème sombre ;
- architecture i18n ;
- patterns d’accessibilité et de responsive.

### 3.3 Éléments Klorv formellement exclus

Ne doivent pas être repris :

- API de génération de jeux ;
- logique Expo ;
- scaffolding de projets mobiles ;
- workers Klorv ou Claw/OpenClaw ;
- schéma de données orienté jeux ;
- assets, bundle IDs ou packaging mobile ;
- pipeline de génération de code Klorv ;
- routes backend Klorv ;
- gestion des previews iOS/Android ;
- logique de publication App Store/Play Store ;
- variables d’environnement propres à Klorv ;
- noms de modèles Klorv ;
- anciens prompts système ou orchestrateurs.

---

## 4. Vision produit

Stack32 doit donner l’impression que l’utilisateur embauche et configure un collaborateur IA, sans jamais voir la complexité sous-jacente.

Le produit repose sur trois expériences :

1. **Build** — l’utilisateur discute avec le Builder de Stack32 pour créer ou modifier son agent.
2. **Live** — l’utilisateur parle directement à l’agent qu’il vient de créer et lui confie des tâches.
3. **Structure** — l’utilisateur voit clairement de quoi son agent est composé, sans code et sans canvas complexe.

La boucle centrale est :

```text
Décrire le besoin
→ Stack32 construit une première version
→ Stack32 teste automatiquement
→ L’utilisateur essaie l’agent
→ L’utilisateur demande des modifications
→ Stack32 applique, reteste et versionne
→ L’utilisateur publie
```

---

## 5. Objectifs du MVP

### 5.1 Objectifs principaux

- Permettre de commencer depuis la landing page avec une simple phrase.
- Conserver le prompt saisi pendant l’inscription et l’onboarding.
- Créer un premier AgentSpec en moins de 30 secondes dans un cas nominal.
- Afficher une première structure visible dès le premier prompt.
- Rendre l’agent immédiatement testable dans Live.
- Permettre de modifier l’agent uniquement par conversation.
- Automatiser la validation et une première réparation.
- Permettre à l’utilisateur de relancer une réparation avec un bouton.
- Conserver les versions précédentes.
- Publier une version stable de l’agent.
- Mesurer le coût, la durée, les erreurs et la qualité de chaque génération.

### 5.2 Non-objectifs du MVP

Le MVP ne doit pas inclure :

- exécution de code arbitraire fourni par les utilisateurs ;
- IDE ou éditeur de code ;
- canvas drag-and-drop ;
- marketplace d’agents ;
- agents vocaux ;
- automatisations planifiées ;
- triggers Gmail ou Slack ;
- navigation web autonome longue durée ;
- intégrations OAuth nombreuses ;
- multi-utilisateur avancé ;
- organisations et rôles complexes ;
- facturation à l’usage sophistiquée ;
- déploiement on-premise ;
- agents multi-jours ;
- sous-agents créés librement par l’utilisateur ;
- export complet du code source ;
- environnement Docker individuel par agent.

---

## 6. Cibles

### 6.1 Utilisateur principal

Personne non technique ou semi-technique qui souhaite créer un agent IA pour un besoin précis :

- entrepreneur ;
- créateur ;
- consultant ;
- commercial ;
- indépendant ;
- étudiant avancé ;
- petite équipe ;
- responsable marketing ;
- support client ;
- chercheur ou analyste.

### 6.2 Jobs-to-be-done

- « Je veux un agent qui recherche et synthétise des informations. »
- « Je veux un agent qui analyse mes documents. »
- « Je veux un agent qui qualifie des prospects. »
- « Je veux un agent qui prépare des emails mais ne les envoie pas. »
- « Je veux un agent qui transforme mes données en rapports. »
- « Je veux un assistant spécialisé dans mon activité. »
- « Je veux construire un agent sans apprendre Python, n8n ou les API. »

---

## 7. Indicateurs de réussite

### 7.1 KPI produit

- Taux de visiteurs qui envoient un prompt depuis la landing page.
- Taux d’inscription après saisie d’un prompt.
- Taux de finalisation de l’onboarding.
- Taux de conversion vers l’abonnement.
- Taux de création réussie d’un agent.
- Temps médian jusqu’au premier AgentSpec visible.
- Temps médian jusqu’au premier test Live.
- Nombre moyen de prompts nécessaires avant un agent jugé utilisable.
- Pourcentage d’agents fonctionnels en cinq prompts ou moins.
- Taux de publication.
- Taux de réparation automatique réussie.
- Nombre de runs Live par utilisateur.
- Rétention J1, J7 et J30.
- Coût LLM moyen par création et par run.

### 7.2 Objectifs initiaux

- 80 % des premiers prompts produisent un AgentSpec valide.
- 95 % des agents atteignent une version testable en cinq prompts ou moins.
- Premier retour visuel en moins de 5 secondes.
- Première version générée en moins de 30 secondes dans 80 % des cas.
- Premier token en Live en moins de 4 secondes dans 80 % des cas simples.
- Moins de 5 % de runs bloqués sans message d’erreur exploitable.
- 100 % des erreurs connues proposent une action claire : réessayer, réparer, connecter une source ou modifier le prompt.

---

## 8. Architecture de l’expérience

### 8.1 Routes principales

```text
/                         Landing page
/features                 Fonctionnalités
/templates                Exemples d’agents
/pricing                  Tarifs
/docs                     Documentation légère
/faq                      Questions fréquentes
/login                    Connexion
/signup                   Inscription
/onboarding               Onboarding en trois étapes
/billing/checkout         Redirection Whop
/billing/success          Retour après paiement
/agents/[agentId]         Redirection vers /build
/agents/[agentId]/build   Builder conversationnel
/agents/[agentId]/live    Utilisation de l’agent
/agents/[agentId]/structure Structure no-code
/settings/profile         Profil
/settings/billing         Abonnement
```

### 8.2 Navigation authentifiée

La barre latérale du Builder contient :

- logo Stack32 ;
- bouton **New agent** ;
- liste des agents ;
- état de chaque agent ;
- menu utilisateur en bas.

La topbar contient :

- onglets Build, Live, Structure ;
- indicateur de sauvegarde ;
- bouton Publish ;
- menu `...` ;
- avatar utilisateur.

---

## 9. Landing page

### 9.1 Navbar

À gauche :

- logo Stack32 ;
- wordmark Stack32.

Au centre :

- Product ;
- Templates ;
- Pricing ;
- Docs.

À droite :

- langue ;
- Sign in ;
- Get started ou avatar si connecté.

### 9.2 Hero

Titre recommandé :

> **Build your next AI agent**

Sous-titre :

> Describe what you need. Stack32 builds the agent, tests it and makes it ready to use.

La zone de prompt doit être l’élément principal. Elle reprend la grande prompt box Klorv, avec :

- textarea ;
- pièce jointe ;
- sélection éventuelle du mode masquée ou désactivée au MVP ;
- microphone facultatif ;
- bouton de soumission ;
- placeholders animés avec exemples d’agents.

Exemples :

- “Create an agent that researches competitors and summarizes changes.”
- “Build an agent that reads my documents and answers questions.”
- “Create a sales research agent that scores leads.”
- “Build an agent that turns notes into structured reports.”

### 9.3 Comportement du prompt non authentifié

1. Le visiteur écrit son besoin.
2. Le prompt est sauvegardé dans `sessionStorage`.
3. Une modale d’authentification s’ouvre.
4. Après inscription, l’utilisateur passe par l’onboarding.
5. Après l’abonnement Whop, il est redirigé vers le Builder.
6. Le prompt initial est automatiquement envoyé.
7. La création commence sans que l’utilisateur le retape.

### 9.4 Sections secondaires

- Agents récemment créés par l’utilisateur s’il est connecté.
- Trois étapes : Describe, Build, Run.
- Exemples d’usage.
- Fonctionnalités.
- Templates.
- FAQ.
- Pricing.
- Footer légal.

---

## 10. Authentification et onboarding

### 10.1 Authentification

Supabase Auth avec :

- email + mot de passe ;
- Google ;
- Apple si nécessaire ;
- magic link facultatif ;
- validation email configurable.

La session doit être gérée côté serveur avec cookies SSR.

### 10.2 Onboarding

Conserver le même format visuel et les mêmes transitions que Klorv : trois étapes, cartes de choix, progression et animation d’introduction.

Étape 1 :

> How did you hear about Stack32?

Étape 2 :

> What best describes you?

Options : Founder, Freelancer, Marketer, Developer, Sales, Student, Other.

Étape 3 :

- First name ;
- Phone facultatif ou obligatoire selon décision commerciale ;
- principal objectif facultatif.

À la fin :

- sauvegarder les réponses ;
- marquer `onboarding_completed = true` ;
- vérifier l’abonnement ;
- rediriger vers le prompt initial.

### 10.3 Paiement

Le MVP utilise un seul abonnement principal Whop.

Le système doit :

- lancer le checkout ;
- recevoir les webhooks ;
- vérifier l’état de l’abonnement côté serveur ;
- empêcher la création ou les runs si l’abonnement n’est pas actif ;
- conserver le prompt initial pendant le checkout ;
- gérer les statuts active, trialing, past_due, canceled et expired.

Le prix, la période d’essai et les limites sont configurables par variables d’environnement.

---

## 11. Builder principal

### 11.1 Layout desktop

Le Builder occupe tout l’écran.

```text
┌──────────────────────┬─────────────────────────────────────────────┐
│ Sidebar agents       │ Topbar : Build / Live / Structure / Publish │
│                      ├─────────────────────────────────────────────┤
│ + New agent          │                                             │
│ Agent A              │             Vue active                      │
│ Agent B              │                                             │
│ Agent C              │                                             │
│                      │                                             │
│ Profil               │             Composer bas                    │
└──────────────────────┴─────────────────────────────────────────────┘
```

Largeur sidebar cible : 290 à 340 px.  
Le contenu principal prend tout l’espace restant.

### 11.2 Barre latérale

En haut :

- logo ;
- bouton New agent.

Liste :

- icône simple générée ;
- nom de l’agent ;
- état par petit indicateur ;
- clic pour changer d’agent ;
- menu contextuel pour renommer, dupliquer ou supprimer.

États possibles :

- Draft ;
- Building ;
- Ready ;
- Needs attention ;
- Published.

En bas :

- avatar ;
- email ou prénom ;
- plan ;
- paramètres.

### 11.3 Topbar

Onglets :

- Build ;
- Live ;
- Structure.

Comportement visuel :

- l’icône des trois onglets reste visible ;
- l’onglet actif s’élargit et affiche son texte ;
- les autres sont plus petits ;
- animation de largeur et d’opacité.

À droite :

- sauvegarde automatique ;
- bouton Publish ;
- menu `...` ;
- avatar.

---

## 12. Vue Build

### 12.1 Objectif

La vue Build est une conversation entre l’utilisateur et le **Stack32 Builder Agent**. Ce n’est pas une conversation avec l’agent créé.

### 12.2 Messages

Les messages utilisateur apparaissent à droite.  
Les messages Stack32 apparaissent à gauche.

Un message Stack32 peut contenir :

- texte ;
- liste courte de changements ;
- statut de création ;
- statut de test ;
- erreur ;
- bouton Test live ;
- bouton View structure ;
- bouton Fix automatically ;
- bouton Retry.

### 12.3 Premier prompt

Exemple :

> Create an agent that researches a company, scores the lead and drafts a personalized email.

Réponse intermédiaire immédiate :

> I’m designing your agent…

Événements visuels simples :

- Understanding the goal ;
- Selecting capabilities ;
- Building the agent ;
- Running a test.

Réponse finale :

> Your Sales Research Agent is ready to test.

Avec résumé :

- goal ;
- tools ;
- knowledge status ;
- output.

### 12.4 Composer

Grande zone de saisie flottante en bas :

- placeholder : `Describe what you want your agent to do or change...`
- bouton pièce jointe ;
- bouton vocal facultatif ;
- sélection de modèle non visible pour le MVP ;
- bouton Build.

Le composer doit rester au centre et reprendre le style Klorv.

### 12.5 Modification

Toute modification est conversationnelle :

- “Make the answers shorter.”
- “Add web research.”
- “Never invent missing information.”
- “Ask me before generating the final report.”
- “Use a table for the output.”
- “Remove the web tool.”

Le Builder produit un patch ciblé sur l’AgentSpec, ne recrée pas l’agent intégralement et lance un nouveau test.

### 12.6 Erreurs et réparation

Si le test échoue :

```text
Your agent was created, but one test failed.
[Fix automatically] [View details] [Try live anyway]
```

Le bouton Fix automatically :

1. récupère le test échoué ;
2. envoie l’erreur au Repair Agent ;
3. applique un patch ;
4. relance le test ;
5. crée une nouvelle version si succès.

Maximum deux réparations automatiques par demande avant de demander à l’utilisateur de reformuler.

---

## 13. Vue Live

### 13.1 Objectif

La vue Live permet de parler à l’agent créé.

Elle doit ressembler à une interface de chat simple, sans paramètres techniques.

### 13.2 Contenu

- nom de l’agent ;
- statut Draft ou Published ;
- conversation Live ;
- suggestions de démarrage ;
- zone de saisie ;
- pièces jointes ;
- affichage des sources utilisées ;
- affichage minimal des outils appelés ;
- bouton Stop pendant un run ;
- bouton Retry en cas d’échec.

### 13.3 Exécution visible

Pendant l’exécution :

- `Searching the web…`
- `Reading your documents…`
- `Analyzing…`
- `Preparing the answer…`

Ne jamais exposer la chaîne de pensée privée. Afficher uniquement des événements métier et d’outil.

### 13.4 Artifacts

Le MVP doit prendre en charge :

- réponse Markdown ;
- tableau ;
- liste structurée ;
- fichier texte ou Markdown téléchargeable ;
- citations de sources web ou documents.

PDF, présentation et tableur sont hors périmètre initial.

---

## 14. Vue Structure

### 14.1 Objectif

Afficher la composition de l’agent sans code, sans JSON et sans graphe complexe.

### 14.2 Sections

- **Goal**
- **Instructions**
- **Model profile**
- **Tools**
- **Knowledge**
- **Memory**
- **Rules**
- **Output**
- **Starter prompts**
- **Test status**
- **Current version**

### 14.3 Interaction

Au MVP, la Structure est principalement en lecture seule.

Chaque section peut proposer :

- “Change in Build” ;
- “Add knowledge” ;
- “Connect tool” ;
- “Run test”.

Les modifications importantes renvoient vers Build avec un prompt prérempli.

---

## 15. Publication et versionnement

### 15.1 Draft et Published

Chaque agent possède :

- une version Draft actuelle ;
- une version Published éventuelle.

Les modifications se font toujours sur Draft.  
Live peut tester Draft.  
Publish remplace la version Published par la version Draft validée.

### 15.2 Conditions de publication

Avant publication :

- AgentSpec valide ;
- aucun outil inconnu ;
- limites définies ;
- au moins un smoke test réussi ;
- aucun secret en clair ;
- statut de l’abonnement actif.

### 15.3 Historique

Chaque version conserve :

- AgentSpec complet ;
- auteur ;
- date ;
- prompt qui a provoqué le changement ;
- résumé du patch ;
- tests ;
- modèle utilisé ;
- coût estimé.

L’utilisateur peut restaurer une version précédente.

---

## 16. Modèle technique d’un agent

### 16.1 Principe

Un agent Stack32 n’est pas un dépôt de code. C’est une configuration exécutable par un runtime partagé.

### 16.2 AgentSpec

Exemple conceptuel :

```json
{
  "schema_version": "1.0",
  "name": "Sales Research Agent",
  "slug": "sales-research-agent",
  "goal": "Research companies, score leads and draft personalized emails.",
  "instructions": {
    "system": "You are a careful B2B sales research agent.",
    "tone": "professional",
    "language": "auto"
  },
  "model_profile": "balanced",
  "input": {
    "channels": ["chat"],
    "attachments": ["pdf", "txt", "md", "csv"]
  },
  "tools": [
    {
      "id": "web_search",
      "enabled": true,
      "approval": "never"
    },
    {
      "id": "knowledge_search",
      "enabled": true,
      "approval": "never"
    }
  ],
  "knowledge": {
    "source_ids": [],
    "retrieval_enabled": true,
    "top_k": 6
  },
  "memory": {
    "conversation": true,
    "semantic": false,
    "retention_days": 30
  },
  "rules": [
    "Do not invent missing facts.",
    "Clearly identify uncertainty."
  ],
  "output": {
    "format": "markdown",
    "schema": null
  },
  "starter_prompts": [
    "Research this company",
    "Score this lead",
    "Draft a personalized email"
  ],
  "runtime": {
    "max_steps": 8,
    "timeout_seconds": 60,
    "max_tool_calls": 6
  }
}
```

### 16.3 Validation

L’AgentSpec est défini par des modèles Pydantic et un JSON Schema versionné.

Toute création ou modification doit passer par :

- validation de schéma ;
- validation métier ;
- vérification des outils ;
- vérification des limites ;
- vérification des sources de connaissance ;
- vérification de sécurité ;
- smoke test.

---

## 17. Builder Agent de Stack32

### 17.1 Rôle

Le Builder Agent transforme une demande naturelle en AgentSpec ou en patch d’AgentSpec.

Il comprend quatre intentions :

- create ;
- update ;
- test ;
- repair.

### 17.2 Pipeline

```text
Message utilisateur
→ Intent classifier
→ Chargement du contexte
→ Planner
→ Workers spécialisés si nécessaire
→ Génération d’un patch AgentSpec
→ Validation
→ Dry run
→ Repair automatique si nécessaire
→ Sauvegarde de la version
→ Réponse au frontend
```

### 17.3 Sous-agents internes

#### Architect Agent

- interprète l’objectif ;
- choisit les capacités ;
- structure l’AgentSpec ;
- définit les contraintes.

#### Instruction Agent

- rédige les instructions système ;
- adapte le ton ;
- ajoute les règles ;
- évite les contradictions.

#### Tool Agent

- choisit uniquement les outils disponibles ;
- configure les paramètres ;
- détecte les credentials manquants ;
- refuse un outil hors catalogue.

#### Test Agent

- génère des cas de test ;
- exécute un dry run ;
- attribue un statut ;
- produit un rapport court.

#### Repair Agent

- analyse le test échoué ;
- produit un patch minimal ;
- ne modifie pas les parties saines ;
- relance la validation.

### 17.4 Orchestration

Le pattern principal est **manager/orchestrator** :

- l’orchestrateur garde le contrôle ;
- les sous-agents sont exposés comme outils ;
- les tâches simples évitent les sous-agents ;
- les tâches indépendantes peuvent être exécutées en parallèle ;
- le nombre d’étapes est limité ;
- toute sortie de sous-agent est structurée.

### 17.5 Modes de traitement

#### Fast path

Pour :

- changement de nom ;
- modification de ton ;
- ajout d’une règle ;
- changement de format ;
- ajout d’un starter prompt.

Un seul modèle rapide produit un patch.

#### Standard path

Pour :

- ajout d’un outil ;
- modification du comportement ;
- ajout de connaissance ;
- changement de sortie.

Planner + Validator + Test.

#### Heavy path

Pour :

- création initiale complexe ;
- plusieurs capacités ;
- conflit de consignes ;
- réparation après échec ;
- restructuration importante.

Orchestrator + plusieurs workers + Test + Repair.

---

## 18. Routage multi-LLM

### 18.1 Principe

Le modèle ne choisit pas librement son fournisseur. Le backend utilise un routeur contrôlé.

### 18.2 Gateway

Utiliser LiteLLM comme abstraction multi-fournisseur ou implémenter une couche interne compatible.

Fonctions :

- OpenAI ;
- Anthropic ;
- Gemini ;
- autres fournisseurs ultérieurement ;
- timeouts ;
- retries ;
- fallback ;
- quotas ;
- suivi du coût ;
- normalisation des erreurs.

### 18.3 Profils

- `fast` : classification, résumé, petites modifications.
- `balanced` : création standard et Live.
- `reasoning` : architecture complexe et réparation.
- `coding` : réservé aux futurs outils de code.
- `embedding` : ingestion documentaire.

Les noms de modèles réels doivent être configurés par environnement et non dispersés dans le code.

### 18.4 Politique de fallback

1. modèle principal du profil ;
2. seconde tentative courte ;
3. modèle secondaire d’un autre fournisseur ;
4. erreur utilisateur exploitable.

Le système doit éviter de relancer une demande coûteuse plusieurs fois sans plafond.

---

## 19. Runtime des agents utilisateurs

### 19.1 Exécution

Lorsqu’un utilisateur envoie un message dans Live :

1. validation de la session ;
2. vérification de l’abonnement ;
3. chargement de la version Draft ou Published ;
4. chargement de l’historique ;
5. chargement des connaissances pertinentes ;
6. sélection du modèle ;
7. création de l’agent runtime ;
8. boucle modèle → outil → résultat ;
9. streaming des événements ;
10. sauvegarde du run et des messages.

### 19.2 Limites MVP

- maximum 8 étapes ;
- maximum 6 appels d’outils ;
- timeout 60 secondes ;
- concurrence limitée ;
- taille maximale des pièces jointes ;
- budget tokens par run ;
- arrêt manuel.

### 19.3 Catalogue d’outils MVP

#### web_search

Recherche web et retour de résultats structurés.

#### fetch_url

Lecture contrôlée d’une URL publique.

#### knowledge_search

Recherche sémantique dans les documents de l’agent.

#### calculator

Calcul déterministe.

#### current_datetime

Date et heure.

#### structured_output

Transformation d’une réponse en structure validée.

#### http_request

Option expérimentale, désactivée par défaut, avec :

- HTTPS uniquement ;
- blocage IP privées ;
- allowlist ;
- timeout ;
- taille de réponse limitée ;
- aucun secret visible par le LLM.

### 19.4 Outils hors MVP

- Gmail ;
- Slack ;
- HubSpot ;
- Notion ;
- calendrier ;
- navigateur complet ;
- shell ;
- exécution Python libre ;
- base de données externe.

---

## 20. Connaissances et RAG

### 20.1 Types de sources

- PDF ;
- TXT ;
- Markdown ;
- CSV simple ;
- URL publique.

### 20.2 Pipeline d’ingestion

```text
Upload
→ Validation MIME/taille
→ Extraction du texte
→ Nettoyage
→ Découpage
→ Embeddings
→ Stockage pgvector
→ Statut Ready
```

### 20.3 Recherche

- filtrage obligatoire par `user_id` et `agent_id` ;
- top-k configurable ;
- métadonnées de source ;
- citations dans la réponse ;
- aucun document d’un autre utilisateur accessible.

### 20.4 État des sources

- Uploading ;
- Processing ;
- Ready ;
- Failed.

---

## 21. Mémoire

### 21.1 MVP

- historique de conversation dans chaque thread Live ;
- résumé automatique quand la conversation devient trop longue ;
- mémoire limitée à l’agent ;
- aucune mémoire globale entre agents par défaut.

### 21.2 Hors MVP

- mémoire sémantique longue durée ;
- profil utilisateur partagé ;
- apprentissage automatique permanent ;
- mémoire d’organisation.

---

## 22. Stack technique

### 22.1 Frontend

- Next.js 16 App Router ;
- React 19 ;
- TypeScript strict ;
- Tailwind CSS v4 ;
- shadcn/ui et Radix ;
- Framer Motion ;
- Lucide React ;
- TanStack Query ;
- Zustand pour l’état UI local ;
- react-i18next ;
- React Markdown ;
- Zod ;
- SSE pour le streaming.

### 22.2 Plateforme de données

- Supabase Auth ;
- Supabase PostgreSQL ;
- Supabase Storage ;
- Supabase Realtime ;
- pgvector ;
- RLS ;
- migrations SQL versionnées.

### 22.3 Backend agentique

- Python 3.12+ ;
- FastAPI ;
- Pydantic v2 ;
- LangGraph pour l’orchestration ;
- LiteLLM pour le routage multi-LLM ;
- clients officiels des fournisseurs si nécessaire ;
- SQLAlchemy ou client Supabase serveur ;
- httpx ;
- OpenTelemetry ;
- Sentry ;
- Langfuse ou équivalent pour les traces LLM.

### 22.4 Infrastructure

- frontend : Vercel ;
- backend Python : Google Cloud Run Service ;
- tâches asynchrones : Cloud Tasks ;
- jobs d’ingestion lourds : Cloud Run Jobs si nécessaire ;
- secrets : Google Secret Manager ;
- images backend : Artifact Registry ;
- CI/CD : GitHub Actions ;
- DNS : Stack32.com.

### 22.5 Paiement

- Whop checkout ;
- webhooks Whop ;
- table de synchronisation locale ;
- contrôle serveur de l’accès.

---

## 23. Structure recommandée du dépôt

```text
stack32/
├── apps/
│   └── web/
│       ├── app/
│       ├── components/
│       ├── hooks/
│       ├── lib/
│       ├── stores/
│       ├── locales/
│       └── public/
├── services/
│   └── agent-service/
│       ├── app/
│       │   ├── api/
│       │   ├── builder/
│       │   ├── runtime/
│       │   ├── models/
│       │   ├── tools/
│       │   ├── knowledge/
│       │   ├── routing/
│       │   ├── security/
│       │   └── observability/
│       ├── tests/
│       ├── pyproject.toml
│       └── Dockerfile
├── packages/
│   ├── ui/
│   ├── config/
│   └── generated-api-types/
├── supabase/
│   ├── migrations/
│   ├── seed.sql
│   └── config.toml
├── infra/
│   ├── cloud-run/
│   └── github-actions/
├── docs/
│   ├── PRD.md
│   ├── AGENT_SPEC.md
│   ├── SECURITY.md
│   └── RUNBOOK.md
└── README.md
```

Le schéma OpenAPI FastAPI doit permettre de générer automatiquement les types TypeScript utilisés par le frontend.

---

## 24. Modèle de données Supabase

### 24.1 profiles

```text
id uuid PK → auth.users.id
first_name text
full_name text
avatar_url text
phone text nullable
locale text default 'en'
onboarding_completed boolean
created_at timestamptz
updated_at timestamptz
```

### 24.2 onboarding_responses

```text
id uuid PK
user_id uuid FK
discovery_source text
discovery_other_detail text nullable
role text
role_other_detail text nullable
primary_goal text nullable
created_at timestamptz
```

### 24.3 subscriptions

```text
id uuid PK
user_id uuid FK
provider text default 'whop'
provider_customer_id text
provider_membership_id text
plan_id text
status text
current_period_end timestamptz nullable
trial_end timestamptz nullable
raw_payload jsonb
created_at timestamptz
updated_at timestamptz
```

### 24.4 agents

```text
id uuid PK
user_id uuid FK
name text
slug text
description text nullable
status text
draft_version_id uuid nullable
published_version_id uuid nullable
icon text nullable
created_at timestamptz
updated_at timestamptz
deleted_at timestamptz nullable
```

### 24.5 agent_versions

```text
id uuid PK
agent_id uuid FK
version_number integer
spec jsonb
change_summary text
source_prompt text nullable
validation_status text
test_status text
model_provider text nullable
model_name text nullable
estimated_cost numeric nullable
created_by uuid
created_at timestamptz
```

Contrainte unique : `(agent_id, version_number)`.

### 24.6 builder_threads

```text
id uuid PK
agent_id uuid FK
user_id uuid FK
created_at timestamptz
updated_at timestamptz
```

### 24.7 builder_messages

```text
id uuid PK
thread_id uuid FK
role text
content text
metadata jsonb
run_id uuid nullable
created_at timestamptz
```

### 24.8 live_threads

```text
id uuid PK
agent_id uuid FK
user_id uuid FK
title text nullable
created_at timestamptz
updated_at timestamptz
```

### 24.9 live_messages

```text
id uuid PK
thread_id uuid FK
role text
content text
artifacts jsonb
citations jsonb
run_id uuid nullable
created_at timestamptz
```

### 24.10 runs

```text
id uuid PK
user_id uuid FK
agent_id uuid FK
agent_version_id uuid FK
thread_id uuid nullable
run_type text
status text
input jsonb
output jsonb nullable
error_code text nullable
error_message text nullable
provider text nullable
model text nullable
prompt_tokens integer nullable
completion_tokens integer nullable
estimated_cost numeric nullable
started_at timestamptz
completed_at timestamptz nullable
created_at timestamptz
```

Types de run :

- build ;
- live ;
- test ;
- repair ;
- ingestion.

### 24.11 run_events

```text
id bigserial PK
run_id uuid FK
sequence integer
event_type text
label text
payload jsonb
created_at timestamptz
```

### 24.12 tool_catalog

```text
id text PK
name text
description text
schema jsonb
risk_level text
enabled boolean
created_at timestamptz
updated_at timestamptz
```

### 24.13 agent_tool_bindings

```text
id uuid PK
agent_id uuid FK
agent_version_id uuid FK
tool_id text FK
config jsonb
approval_mode text
enabled boolean
created_at timestamptz
```

### 24.14 knowledge_sources

```text
id uuid PK
user_id uuid FK
agent_id uuid FK
type text
name text
storage_path text nullable
source_url text nullable
status text
error_message text nullable
metadata jsonb
created_at timestamptz
updated_at timestamptz
```

### 24.15 knowledge_chunks

```text
id uuid PK
source_id uuid FK
user_id uuid FK
agent_id uuid FK
content text
embedding vector
metadata jsonb
chunk_index integer
created_at timestamptz
```

### 24.16 agent_tests

```text
id uuid PK
agent_id uuid FK
agent_version_id uuid FK
name text
input jsonb
expected jsonb nullable
status text
score numeric nullable
report jsonb
run_id uuid nullable
created_at timestamptz
```

### 24.17 usage_events

```text
id uuid PK
user_id uuid FK
agent_id uuid nullable
event_name text
quantity numeric
metadata jsonb
created_at timestamptz
```

### 24.18 webhook_events

```text
id uuid PK
provider text
provider_event_id text unique
event_type text
payload jsonb
status text
processed_at timestamptz nullable
created_at timestamptz
```

---

## 25. RLS et autorisation

Règles obligatoires :

- toutes les tables exposées ont RLS activé ;
- un utilisateur ne lit que ses propres données ;
- un agent est accessible uniquement si `agents.user_id = auth.uid()` ;
- les versions héritent de l’autorisation de l’agent ;
- les documents et chunks sont filtrés par user et agent ;
- les webhooks, catalogues internes et traces détaillées ne sont jamais accessibles directement au client ;
- la clé `service_role` n’est utilisée que côté serveur ;
- les appels privilégiés passent par FastAPI ou une route serveur Next.js.

Les politiques doivent être testées avec deux utilisateurs de test afin de vérifier l’absence de fuite inter-compte.

---

## 26. API backend

Préfixe : `/v1`

### 26.1 Agents

```text
GET    /agents
POST   /agents
GET    /agents/{agent_id}
PATCH  /agents/{agent_id}
DELETE /agents/{agent_id}
POST   /agents/{agent_id}/duplicate
```

### 26.2 Builder

```text
GET  /agents/{agent_id}/builder/messages
POST /agents/{agent_id}/builder/messages
GET  /runs/{run_id}/stream
POST /agents/{agent_id}/repair
POST /agents/{agent_id}/test
```

Le POST Builder retourne immédiatement :

```json
{
  "run_id": "uuid",
  "status": "queued"
}
```

Le frontend ouvre ensuite un flux SSE.

### 26.3 Live

```text
GET  /agents/{agent_id}/live/threads
POST /agents/{agent_id}/live/threads
GET  /live/threads/{thread_id}/messages
POST /live/threads/{thread_id}/messages
POST /runs/{run_id}/cancel
```

### 26.4 Structure et versions

```text
GET  /agents/{agent_id}/structure
GET  /agents/{agent_id}/versions
POST /agents/{agent_id}/versions/{version_id}/restore
POST /agents/{agent_id}/publish
```

### 26.5 Knowledge

```text
POST   /agents/{agent_id}/knowledge/upload
POST   /agents/{agent_id}/knowledge/url
GET    /agents/{agent_id}/knowledge
DELETE /agents/{agent_id}/knowledge/{source_id}
```

### 26.6 Billing

```text
POST /billing/create-checkout
POST /webhooks/whop
GET  /billing/status
```

---

## 27. Streaming et événements

Le backend utilise SSE pour les runs Build et Live.

Événements possibles :

```text
run.started
status
message.delta
tool.started
tool.completed
artifact.created
validation.started
validation.completed
test.started
test.completed
repair.started
spec.updated
run.completed
run.failed
run.canceled
```

Exemple :

```json
{
  "type": "status",
  "run_id": "uuid",
  "label": "Building your agent",
  "data": {}
}
```

Le frontend doit pouvoir se reconnecter avec le dernier identifiant d’événement et récupérer les événements manquants depuis Supabase.

---

## 28. Traitement du premier prompt

### 28.1 Séquence

```text
1. Créer agents row avec status=building.
2. Créer Builder thread.
3. Sauvegarder le message utilisateur.
4. Créer un run build.
5. Envoyer immédiatement run.started.
6. Classifier la demande.
7. Générer un nom et un objectif provisoires.
8. Sauvegarder une structure partielle visible.
9. Afficher cette structure dans Structure.
10. Continuer l’architecture complète.
11. Valider AgentSpec.
12. Lancer un smoke test.
13. Réparer une fois si nécessaire.
14. Créer agent_version v1.
15. Marquer Draft ready ou needs_attention.
16. Afficher le bouton Test agent.
```

### 28.2 Exigence de visibilité

Même si la génération complète prend du temps, l’utilisateur doit voir rapidement :

- nom proposé ;
- objectif compris ;
- capacités choisies ;
- état de progression.

Le premier écran ne doit jamais rester vide avec uniquement un spinner.

---

## 29. Tests automatiques des agents

### 29.1 Tests structurels

- AgentSpec parse correctement ;
- nom et goal présents ;
- instructions présentes ;
- outils valides ;
- limites positives ;
- output valide ;
- aucune référence à un outil inexistant.

### 29.2 Smoke test

Le Test Agent génère un input représentatif, puis exécute l’agent avec :

- outils réels sans effets destructifs ;
- outils mockés si credential absent ;
- budget réduit ;
- timeout court.

### 29.3 Résultat

- Passed ;
- Passed with warnings ;
- Failed.

Le rapport utilisateur reste court. Le rapport technique complet est conservé dans les logs.

---

## 30. Sécurité

### 30.1 Principes

- aucune exécution de code arbitraire ;
- outils en allowlist ;
- paramètres validés par Pydantic ;
- secrets jamais injectés dans les prompts ;
- isolation stricte par user et agent ;
- taille des inputs limitée ;
- rate limiting ;
- contrôle des coûts ;
- logs d’audit ;
- protection SSRF ;
- validation des URLs ;
- antivirus ou scan basique des fichiers ;
- MIME vérifié côté serveur ;
- RLS Supabase ;
- JWT Supabase vérifié par FastAPI ;
- signatures de webhooks vérifiées.

### 30.2 Prompt injection

Les documents et pages web doivent être marqués comme contenu non fiable.

Le runtime doit séparer :

- instructions système ;
- configuration Stack32 ;
- demande utilisateur ;
- contenu récupéré ;
- résultats d’outils.

Un contenu externe ne peut pas :

- ajouter un outil ;
- modifier l’AgentSpec ;
- lire des secrets ;
- dépasser les permissions ;
- publier une version.

### 30.3 HTTP tool

Le HTTP tool doit bloquer :

- localhost ;
- IP privées ;
- metadata endpoints cloud ;
- schémas autres que HTTPS ;
- redirections vers une IP interdite ;
- réponses trop volumineuses.

---

## 31. Contrôle des coûts

Chaque plan possède :

- plafond mensuel ;
- plafond par run ;
- plafond de runs simultanés ;
- profils de modèles autorisés.

Le routeur doit :

- utiliser fast path quand possible ;
- résumer le contexte ;
- ne pas renvoyer tout l’historique ;
- utiliser des sorties structurées ;
- mettre en cache les embeddings ;
- dédupliquer les documents ;
- éviter les réparations infinies ;
- journaliser les coûts.

En cas de limite atteinte :

> You’ve reached your current usage limit.

Ne pas laisser un run coûteux commencer si le budget restant est insuffisant.

---

## 32. Observabilité

### 32.1 Logs

- requêtes API ;
- runs ;
- étapes ;
- appels d’outils ;
- latence ;
- provider ;
- modèle ;
- tokens ;
- coût ;
- erreurs ;
- version d’AgentSpec.

### 32.2 Outils

- Sentry pour frontend et backend ;
- Langfuse pour les traces LLM ;
- OpenTelemetry ;
- logs Cloud Run ;
- dashboard interne Supabase ou Metabase ultérieurement.

### 32.3 Alertes

- taux d’erreur provider ;
- runs bloqués ;
- latence élevée ;
- dépassement de coûts ;
- webhooks échoués ;
- ingestion échouée ;
- hausse anormale de réparations.

---

## 33. Gestion des erreurs

Chaque erreur possède :

- code interne ;
- message utilisateur ;
- action recommandée ;
- possibilité de retry ;
- `run_id` pour support.

Codes initiaux :

```text
AUTH_REQUIRED
SUBSCRIPTION_REQUIRED
AGENT_NOT_FOUND
AGENT_SPEC_INVALID
MODEL_TIMEOUT
MODEL_PROVIDER_UNAVAILABLE
TOOL_NOT_AVAILABLE
TOOL_CALL_FAILED
KNOWLEDGE_PROCESSING
KNOWLEDGE_FAILED
RUN_LIMIT_REACHED
USAGE_LIMIT_REACHED
VALIDATION_FAILED
TEST_FAILED
REPAIR_FAILED
INTERNAL_ERROR
```

Ne jamais afficher une stack trace ou une clé API au client.

---

## 34. Responsive et accessibilité

### 34.1 Desktop

Expérience principale optimisée pour 1280 px et plus.

### 34.2 Tablette

- sidebar repliable ;
- topbar conservée ;
- composer plein écran ;
- Structure en liste.

### 34.3 Mobile

Le Builder doit rester utilisable mais peut être simplifié :

- menu agents dans un drawer ;
- onglets sticky ;
- une vue à la fois ;
- composer fixe en bas.

### 34.4 Accessibilité

- navigation clavier ;
- focus visibles ;
- labels ARIA ;
- contraste suffisant ;
- `prefers-reduced-motion` ;
- zones cliquables minimum 40 px ;
- annonces `aria-live` pour les statuts ;
- aucun sens communiqué uniquement par la couleur.

---

## 35. Événements analytics

```text
landing_prompt_started
landing_prompt_submitted
auth_modal_opened
signup_completed
onboarding_started
onboarding_completed
checkout_started
subscription_activated
agent_creation_started
agent_partial_spec_visible
agent_creation_completed
agent_creation_failed
builder_prompt_sent
agent_test_started
agent_test_passed
agent_test_failed
repair_started
repair_completed
live_run_started
live_run_completed
live_run_failed
structure_viewed
agent_published
agent_restored
knowledge_uploaded
```

Chaque événement doit inclure uniquement les métadonnées nécessaires et ne pas envoyer le contenu privé complet des prompts dans l’analytics produit.

---

## 36. Tests du produit

### 36.1 Frontend

- tests composants ;
- tests hooks ;
- tests état ;
- tests responsive ;
- tests accessibilité ;
- E2E Playwright.

### 36.2 Backend

- tests Pydantic AgentSpec ;
- tests router ;
- tests fallback ;
- tests tools ;
- tests RLS ;
- tests JWT ;
- tests webhooks ;
- tests ingestion ;
- tests SSE ;
- tests idempotence.

### 36.3 Golden prompts

Créer une suite d’au moins 30 prompts représentatifs :

- recherche ;
- analyse de documents ;
- sales ;
- contenu ;
- support ;
- reporting ;
- extraction structurée ;
- modifications ;
- contraintes contradictoires ;
- prompts vagues ;
- prompts en français et anglais.

Pour chaque prompt, vérifier :

- AgentSpec valide ;
- choix d’outils cohérent ;
- absence d’outil halluciné ;
- test exécutable ;
- coût sous plafond.

---

## 37. Critères d’acceptation MVP

### Landing

- le hero Stack32 est visible ;
- le prompt est utilisable ;
- le prompt non authentifié est conservé ;
- la modale auth fonctionne ;
- le retour après onboarding reprend le prompt.

### Auth et onboarding

- email et Google fonctionnent ;
- l’utilisateur ne peut pas accéder au Builder sans session ;
- onboarding en trois étapes ;
- données sauvegardées ;
- accès payant vérifié.

### Agents

- création d’un agent ;
- liste sidebar ;
- changement d’agent ;
- renommage ;
- suppression logique ;
- statut visible.

### Build

- message sauvegardé ;
- streaming ;
- structure partielle rapide ;
- AgentSpec généré ;
- test ;
- réparation ;
- version créée ;
- erreurs lisibles.

### Live

- message envoyé ;
- agent exécuté ;
- outils appelés ;
- réponse streamée ;
- conversation persistée ;
- arrêt et retry.

### Structure

- sections affichées ;
- Draft et Published visibles ;
- version visible ;
- lien vers Build.

### Publish

- validation préalable ;
- publication ;
- restauration ;
- version Published utilisée selon le contexte.

### Sécurité

- RLS testée ;
- isolation inter-utilisateur ;
- service role absent du client ;
- secrets masqués ;
- webhooks signés ;
- HTTP tool protégé.

---

## 38. Ordre d’implémentation recommandé

### Phase 1 — Fondation UI

- nouveau dépôt Stack32 ;
- design system inspiré de Klorv ;
- landing page ;
- auth modal ;
- onboarding ;
- layout Builder ;
- sidebar agents ;
- vues Build, Live, Structure avec données mockées.

### Phase 2 — Supabase

- Auth SSR ;
- migrations ;
- profiles ;
- agents ;
- messages ;
- versions ;
- RLS ;
- Storage ;
- Realtime.

### Phase 3 — Backend Python

- FastAPI ;
- JWT ;
- AgentSpec Pydantic ;
- CRUD agents ;
- runs ;
- SSE ;
- Cloud Run.

### Phase 4 — Builder Agent

- classifier ;
- planner ;
- génération AgentSpec ;
- patch ;
- validation ;
- versionnement ;
- premier test ;
- repair.

### Phase 5 — Runtime Live

- chargement AgentSpec ;
- model router ;
- tools ;
- streaming ;
- mémoire conversationnelle ;
- historique.

### Phase 6 — Knowledge

- upload ;
- extraction ;
- chunks ;
- embeddings ;
- pgvector ;
- citations.

### Phase 7 — Billing et hardening

- Whop ;
- usage ;
- limites ;
- logs ;
- Sentry ;
- Langfuse ;
- tests E2E ;
- déploiement.

---

## 39. Variables d’environnement

### Frontend

```text
NEXT_PUBLIC_APP_URL
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
NEXT_PUBLIC_DEFAULT_LOCALE
NEXT_PUBLIC_WHOP_PLAN_ID
AGENT_SERVICE_URL
AGENT_SERVICE_INTERNAL_TOKEN
```

### Backend

```text
ENVIRONMENT
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_JWT_ISSUER
SUPABASE_JWKS_URL

OPENAI_API_KEY
ANTHROPIC_API_KEY
GEMINI_API_KEY

LITELLM_CONFIG_PATH
MODEL_FAST
MODEL_BALANCED
MODEL_REASONING
MODEL_EMBEDDING

LANGFUSE_PUBLIC_KEY
LANGFUSE_SECRET_KEY
LANGFUSE_HOST
SENTRY_DSN

GCP_PROJECT_ID
GCP_REGION
GCP_TASKS_QUEUE
GCP_SECRET_MANAGER_PREFIX

WHOP_API_KEY
WHOP_WEBHOOK_SECRET
WHOP_PLAN_ID

MAX_RUN_STEPS
MAX_TOOL_CALLS
MAX_RUN_SECONDS
MAX_UPLOAD_MB
MONTHLY_USAGE_LIMIT
```

Aucune clé ne doit être préfixée `NEXT_PUBLIC_` sauf les valeurs explicitement publiques.

---

## 40. Décisions techniques importantes

1. **Supabase remplace Firebase.**  
   PostgreSQL et pgvector correspondent mieux aux relations entre agents, versions, messages, runs et documents.

2. **Le Builder est Python.**  
   L’écosystème agentique, Pydantic, LangGraph et les outils IA sont mieux adaptés.

3. **Les agents sont des AgentSpec.**  
   Aucun projet Python indépendant au MVP.

4. **Le runtime est partagé.**  
   Tous les agents sont exécutés par le même moteur sécurisé.

5. **Le routeur LLM est contrôlé.**  
   Le LLM ne choisit jamais librement un fournisseur.

6. **La Structure est lisible, pas éditable comme n8n.**  
   Les modifications passent par le chat.

7. **Le premier prompt doit produire du visible très vite.**  
   La structure partielle est sauvegardée avant la fin du run.

8. **Les tests font partie de la création.**  
   Un agent n’est pas marqué Ready uniquement parce que le JSON est valide.

9. **Aucun code arbitraire.**  
   Les futurs custom tools devront être isolés dans des sandboxes dédiées.

10. **Klorv sert uniquement de référence frontend.**  
    La logique métier et le backend Stack32 sont entièrement nouveaux.

---

## 41. Évolutions après validation du marché

- intégrations Gmail, Slack, Notion, HubSpot et Calendar ;
- OAuth via Composio ou Pipedream Connect ;
- triggers et exécutions en arrière-plan ;
- agents multi-agents ;
- approbations humaines ;
- widget embarqué ;
- API publique ;
- email dédié à chaque agent ;
- templates et marketplace ;
- collaboration en équipe ;
- agents vocaux ;
- custom tools Python dans sandbox ;
- MCP ;
- déploiement externe ;
- webhooks entrants et sortants ;
- analytics d’agent ;
- évaluation continue ;
- mémoire sémantique ;
- agents planifiés ;
- export/import d’AgentSpec.

---

## 42. Definition of Done

Le MVP est considéré prêt à tester publiquement lorsqu’un nouvel utilisateur peut :

1. arriver sur Stack32.com ;
2. saisir un prompt ;
3. créer son compte ;
4. terminer l’onboarding ;
5. souscrire ;
6. retrouver automatiquement son prompt ;
7. voir un agent apparaître ;
8. visualiser sa structure ;
9. le tester en Live ;
10. demander une modification ;
11. obtenir une nouvelle version ;
12. réparer automatiquement un problème ;
13. publier l’agent ;
14. revenir plus tard et retrouver ses agents, conversations et versions.

Aucune étape de ce parcours ne doit exiger du code, un canvas, une API key personnelle ou une compréhension technique des agents IA.

---

## 43. Consigne finale pour l’équipe de développement

Construire Stack32 comme un nouveau produit. Ne pas transformer Klorv en Stack32 par remplacement de noms.

Le frontend peut reprendre et adapter les composants visuels de Klorv, mais chaque élément doit être réévalué selon le parcours Stack32.

Priorité absolue :

> **Prompt → première structure visible → test Live → amélioration par chat.**

Tout élément qui ne contribue pas directement à cette boucle doit être reporté après le MVP.
