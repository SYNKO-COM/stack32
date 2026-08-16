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

### 2. Optionnel — anti-spam à l’inscription (CAPTCHA)

Utile si tu as peur des faux comptes. **Pas obligatoire** pour être en prod.

1. Va sur [https://supabase.com/dashboard/project/mhwzxpscyvuavpfqxfgm/auth/url-configuration](https://supabase.com/dashboard/project/mhwzxpscyvuavpfqxfgm/auth/url-configuration) (ou Auth → Attack Protection)
2. Active **CAPTCHA** (hCaptcha ou Turnstile)
3. Colle les clés dans le dashboard Supabase

Si tu as les clés et que tu préfères que je le fasse : **envoie-moi les 2 clés** (site key + secret), je te guide / configure ce qui est possible.

### 3. Optionnel — e-mails des runs planifiés (SMTP)

Aujourd’hui : les agents tournent, mais les **e-mails de notification** des schedules ne partent pas encore (pas de boîte mail SMTP configurée).

Si tu veux ça, envoie-moi :

- serveur SMTP (ex. `smtp.gmail.com` ou ton hébergeur)
- port (souvent `465` ou `587`)
- e-mail + mot de passe (ou “app password”)
- l’adresse “From” souhaitée (ex. `no_reply@stack32.com`)

→ Je configure ça automatiquement sur Cloud Run.

### 4. Optionnel — connexion Google (Gmail / Calendar natif)

Seulement si tu veux le bouton “Connect Google” first-party (hors Pipedream).

Envoie-moi :

- **Client ID** Google
- **Client Secret** Google  

(créés dans Google Cloud → APIs & Services → Credentials → OAuth client)

→ Je branche les variables.

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
