# Stack32 — Production (version simple)

Mis à jour : **16 août 2026**

Ce fichier répond à une seule question :  
**qu’est-ce qui marche déjà, et qu’est-ce qu’il te reste à faire ?**

---

## En une phrase

**Le site + l’API agents sont en production et opérationnels.**  
Tu peux ouvrir [https://stack32.com](https://stack32.com), créer un compte, et utiliser le builder.

---

## Déjà fait (rien à refaire)

| Quoi | Statut |
| --- | --- |
| Site web sur Vercel | ✅ Fait |
| Domaine **stack32.com** | ✅ Fait (DNS OK, site servi par Vercel) |
| Base de données Supabase | ✅ Fait |
| Connexion / inscription (Auth) | ✅ Fait |
| Serveur agents (Google Cloud / Cloud Run) | ✅ Fait et **ready** |
| Clés IA (OpenAI, xAI) | ✅ Fait |
| Sandbox builder (E2B) | ✅ Fait |
| Intégrations Pipedream | ✅ Fait (branché sur Cloud Run) |
| Paiements Whop (clés sur Vercel) | ✅ Fait (`BILLING_MODE=whop`) |
| Recherche web (Tavily) | ✅ Fait |
| Anti-spam inscription (**hCaptcha** invisible / passif) | ✅ Fait |

**Liens utiles**

- Site : https://stack32.com  
- API agents : https://stack32-agent-api-732339494633.europe-west1.run.app  
- Santé API : https://stack32-agent-api-732339494633.europe-west1.run.app/ready  

---

## Ce qu’il te reste à faire (toi)

### 1. Tester que tout marche (obligatoire — 5 minutes)

1. Ouvre **https://stack32.com**
2. Clique **Sign up** / crée un compte
3. Confirme ton e-mail (regarde ta boîte mail)
4. Choisis un **username** à l’onboarding
5. Crée un agent dans le **builder**
6. Si tu veux publier : clique **Publish**, puis ouvre la page publique

Si une étape plante : envoie-moi **la page URL + une capture d’écran + le message d’erreur**. Je corrige.

### 2. Optionnel — e-mails des runs planifiés (SMTP)

Aujourd’hui : les agents tournent, mais les **e-mails de notification** des schedules ne partent pas encore (pas de boîte mail SMTP configurée).

Si tu veux ça, envoie-moi :

- serveur SMTP (ex. `smtp.gmail.com` ou ton hébergeur)
- port (souvent `465` ou `587`)
- e-mail + mot de passe (ou “app password”)
- l’adresse “From” souhaitée (ex. `no_reply@stack32.com`)

→ Je configure ça automatiquement sur Cloud Run.

### 3. Optionnel — connexion Google (Gmail / Calendar natif)

Seulement si tu veux le bouton “Connect Google” first-party (hors Pipedream).

Envoie-moi :

- **Client ID** Google
- **Client Secret** Google  

(créés dans Google Cloud → APIs & Services → Credentials → OAuth client)

→ Je branche les variables.

---

## hCaptcha (déjà branché)

- **Sitekey** (public) : sur Vercel + front (mode **invisible** → les gens ne voient en général pas de case à cocher)
- **Secret** : uniquement dans **Supabase Auth** (jamais dans le code / front)
- Dans le dashboard hCaptcha → **Sites** : ajoute les domaines `stack32.com`, `www.stack32.com`, `stack32.vercel.app` (et `localhost` si tu testes en local)

Le CAPTCHA n’est **pas** requis en local/mock tant que `NEXT_PUBLIC_HCAPTCHA_SITEKEY` est vide.

---

## Ce que tu n’as PAS à toucher

- Google Cloud / Terraform / Docker / Secret Manager → **déjà fait**
- Variables Vercel principales → **déjà fait**
- DNS du domaine → **déjà fait**
- Ne lance **jamais** `supabase db reset` sur le projet hébergé

---

## Si quelque chose ne marche pas

Envoie-moi simplement :

1. L’URL de la page  
2. Ce que tu cliquais  
3. Le message d’erreur (ou une capture)  

Je m’occupe du reste.
