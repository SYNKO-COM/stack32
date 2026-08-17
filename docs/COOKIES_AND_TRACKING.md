# Cookies, consentement et tracking (Stack32)

Mis à jour : **17 août 2026**

Le site affiche un bandeau **Tout accepter / Tout refuser / Personnaliser**.  
Tant que la personne n’a pas choisi, **PostHog, Meta et TikTok ne se chargent pas**.

Ce n’est **pas** un avis d’avocat. Un juriste peut relire les textes `/legal/privacy` et `/legal/cookies` si tu veux une validation formelle.

---

## Ce qui est déjà dans le code

- Bandeau + panneau de préférences (catégories : nécessaires, mesure d’audience, publicité)
- Lien **Paramètres des cookies** et **Ne pas vendre ni partager mes données** (CCPA/CPRA) dans le pied de page
- Choix enregistré **13 mois** (recommandation CNIL), puis le bandeau revient
- Signal navigateur **GPC** (Global Privacy Control) = publicité coupée
- Page [https://stack32.com/legal/cookies](https://stack32.com/legal/cookies) à jour

Sans les clés ci-dessous, le bandeau fonctionne quand même : les scripts optionnels restent simplement inactifs.

---

## 1. PostHog (activité + replay de session)

Le site utilise le SDK **Next.js / `posthog-js`** ([doc officielle](https://posthog.com/docs/libraries/next-js)), chargé **uniquement après** consentement analytics.  
On n’utilise pas `instrumentation-client.ts` ni le wizard `npx @posthog/wizard` : ils initialiseraient PostHog avant le bandeau cookies (non conforme RGPD/CNIL).

React Native et Python ne s’appliquent pas à stack32.com (app Next.js). `posthog-node` (serveur) n’est pas branché pour ne pas tracker hors consentement.

Projet actuel : **cloud US** (`https://us.i.posthog.com`). Signe le DPA PostHog. Tu peux plus tard migrer le projet vers le cloud UE si tu veux héberger les données en Europe.

Variables Vercel (déjà le nom officiel) :

| Nom | Valeur |
| --- | --- |
| `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` | clé `phc_…` du projet |
| `NEXT_PUBLIC_POSTHOG_HOST` | `https://us.i.posthog.com` |

`NEXT_PUBLIC_*` sont figées au **build** : un redéploiement est obligatoire après ajout/changement.

Vérif : accepte les cookies analytics sur stack32.com, puis PostHog → **Activity** / **Replay**. Un **Tout refuser** ne doit rien envoyer. Active **Session replay** dans le projet PostHog si ce n’est pas déjà fait.

---

## 2. Pixel Meta (Facebook / Instagram)

1. [Meta Events Manager](https://business.facebook.com/events_manager)
2. Connecte la BM / la page → **Sources de données → Web → Pixel**
3. Copie l’**ID du pixel** (chiffres uniquement)

Vercel :

| Nom | Valeur |
| --- | --- |
| `NEXT_PUBLIC_META_PIXEL_ID` | `1234567890` |

Le pixel ne se charge **qu’après** acceptation de la catégorie publicité.

---

## 3. Pixel TikTok

1. [TikTok Events Manager](https://ads.tiktok.com/i18n/events_manager)
2. **Web → Pixel** → copie l’ID (souvent `C…` ou un id long)

Vercel :

| Nom | Valeur |
| --- | --- |
| `NEXT_PUBLIC_TIKTOK_PIXEL_ID` | ton ID pixel |

Même règle : consentement marketing obligatoire.

---

## 4. Ordre recommandé

1. Déploie le site **sans** les clés → teste le bandeau (accepter / refuser / personnaliser / rouvrir depuis le footer).
2. Crée PostHog EU, colle les 2 variables, redéploie, teste avec **Tout accepter**.
3. Ajoute Meta, puis TikTok, un par un, en vérifiant qu’un **Tout refuser** n’envoie plus d’événements (extensions type Meta Pixel Helper / TikTok Pixel Helper).

---

## Ce que tu n’as pas besoin d’acheter

Pas d’Axeptio / Cookiebot / OneTrust obligatoire : le bandeau est **first-party** dans Stack32.  
Si plus tard tu veux un CMP certifié IAB (TCM / GPP) pour beaucoup plus de pixels, on pourra le brancher. Pour PostHog + 2 pixels, ce n’est pas nécessaire.

---

## Comptes / contrats à faire de ton côté

- PostHog : compte + DPA
- Meta : Business Manager + pixel
- TikTok Ads : compte pubs + pixel
- (Optionnel) avocat pour relecture RGPD / CCPA
