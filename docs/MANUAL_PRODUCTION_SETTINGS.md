# Production ops checklist (Stack32)

## Already done automatically

- `BILLING_MODE=whop` and `AI_EXECUTION_MODE=agent-service` on Vercel Production
- `CRON_SECRET` created on Vercel Production
- Vercel Cron **daily at 04:00 UTC** → `/api/billing/reconcile` (Hobby plan limit; upgrade to Pro for every-15-min)
- Repo pins **Node 22.x** (`package.json` engines + `.nvmrc`) so Vercel should stop using 24.x after the next deploy

## You only need to click these in the Vercel dashboard

Open: https://vercel.com/synkos-projects/stack32/settings

1. **Settings → General → Node.js Version**  
   Confirm it shows **22.x** after deploy (engines should force it). If it still says 24.x, set **22.x** manually and save.

2. **Settings → Deployment Protection**  
   - Production: keep **public** (no protection) so `stack32.com` stays open.  
   - Preview: enable **Standard Protection** (Vercel Authentication) so random preview URLs are not public.

3. **Settings → Deployment Protection → Skew Protection** (if the toggle exists)  
   Enable it. This keeps old clients talking to a matching deployment during rollouts.

## Optional (GCP)

Only if you want a second reconciler outside Vercel Cron:

- Cloud Scheduler → `GET https://stack32.com/api/billing/reconcile`  
  Header: `Authorization: Bearer <same CRON_SECRET as Vercel>`

You do **not** need this if Vercel Cron is enabled (it is, after this deploy).
