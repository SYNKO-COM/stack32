/** Explicit opt-in smoke on the isolated preproduction domain with a synthetic account.
 * Real builder and DB; mock billing only. Never provides an LLM key or executes integrations.
 */
import fs from 'node:fs/promises';
import { chromium, devices, expect } from '@playwright/test';
const base = 'https://pre-prod-659874458xx.stack32.com';
const accountFile = process.env.STACK32_PREPROD_TEST_ACCOUNT_FILE;
if (!accountFile) throw new Error('Synthetic preproduction account file required');
const account = JSON.parse(await fs.readFile(accountFile, 'utf8'));
if (account.url !== 'https://fbqjuqnkemlofklrjeuo.supabase.co' || !account.email.endsWith('@stack32.test')) throw new Error('PREPRODUCTION_TEST_ACCOUNT_REQUIRED');
const { defaultBrowserType, ...phone } = devices['iPhone 13'];
void defaultBrowserType;
const browser = await chromium.launch();
const context = await browser.newContext({ ...phone, locale: 'fr-FR' });
await context.addCookies([{ name:'stack32_consent',value:'{"v":1,"analytics":false,"marketing":false,"ts":4102444800000}',domain:new URL(base).hostname,path:'/',secure:true,sameSite:'Lax' }]);
const page = await context.newPage();
page.setDefaultTimeout(30_000);
const at = async id => expect(page.getByTestId('mobile-onboarding')).toHaveAttribute('data-step', id, { timeout: 40_000 });
const next = async (name='Continuer') => page.getByRole('button',{name,exact:true}).click();
const choice = async name => { await page.getByRole('radio',{name,exact:true}).click(); await next(); };
const rest = async path => {
 const response=await fetch(account.url+'/rest/v1/'+path,{headers:{apikey:account.anon,Authorization:'Bearer '+account.session.access_token}});
 if(!response.ok) throw new Error('Owned preproduction read failed: '+response.status);
 return response.json();
};
try {
 await page.goto(base+'/');
 await page.getByTestId('builder-composer').fill('Résumer uniquement le texte fourni par moi et préparer un brouillon à valider. Aucun accès à un compte externe.');
 await page.getByTestId('builder-composer').press('Enter');
 await at('definition'); await next("J'ai compris");
 await choice('Automatiser mon activité'); await choice('Freelance'); await choice("J'ai essayé");
 await page.locator('#journey-answer').fill('Résumer mes notes de test fictives fournies dans le chat.'); await next();
 await choice('Chaque jour'); await choice('15 à 30 min'); await next('Passer cette étape');
 await choice('Je veux garder le contrôle'); await choice('Gagner du temps');
 await at('a.suggestion'); await next(); await at('a.explain'); await next(); await at('account');
 await page.getByRole('button',{name:/sign in|se connecter/i}).click();
 await page.getByLabel(/email/i).fill(account.email); await page.locator('#auth-password').fill(account.password);
 await page.locator('form').getByRole('button',{name:/sign in|se connecter/i}).click();
 await at('a.projection'); await page.reload(); await at('a.projection'); await next();
 await page.locator('#journey-answer').fill('Pour ce test fictif, résume cette note : la réunion de test aura lieu jeudi à 10 h, préparer son ordre du jour. Ne rien envoyer.'); await next();
 await choice('Un résumé'); await choice('Avant chaque envoi'); await choice('Temps gagné'); await at('a.plan'); await next(); await at('build');
 const [initial] = await rest('onboarding_projects?select=*&user_id=eq.'+account.user_id);
 if(!initial?.agent_id) throw new Error('No real durable agent');
 console.log(JSON.stringify({phase:'preparation_started',project:initial.id,agent:initial.agent_id,run:initial.preparation_run_id}));
 await page.reload(); await at('build');
 await expect(page.getByTestId('mobile-onboarding')).toHaveAttribute('data-step','ready',{timeout:300_000});
 const [ready] = await rest('onboarding_projects?select=*&user_id=eq.'+account.user_id);
 if(ready.agent_id!==initial.agent_id || Date.now()-Date.parse(ready.preparation_started_at)<50_000) throw new Error('Preparation sequence/reuse failed');
 const [version]=await rest('agent_versions?select=spec,test_status&id=eq.'+ready.version_id);
 if(!version.spec.graph.nodes.length || version.test_status!=='not_run') throw new Error('Invalid real prepared draft');
 await page.screenshot({path:'/private/tmp/stack32-onboarding-preprod-ready.png',fullPage:true});
 await next('Utiliser cet agent'); await expect(page).toHaveURL(/billing\/plans/,{timeout:40_000});
 await expect(page.getByRole('button',{name:/commencer gratuitement|start for free/i})).toHaveCount(0);
 await page.goto(base+'/billing/success?status=canceled');
 await page.getByRole('link',{name:'Revenir à mon agent'}).click(); await at('ready');
 if((await rest('runs?select=id&agent_id=eq.'+ready.agent_id+'&run_type=eq.live')).length) throw new Error('Unpaid launch');
 // The preproduction deployment is configured BILLING_MODE=mock; no Whop purchase.
 await page.goto(base+'/api/billing/mock-activate?plan=starter&interval=monthly&credits=100');
 await expect(page).toHaveURL(new RegExp('/agents/'+ready.agent_id+'/agent'),{timeout:60_000});
 await expect(page.getByText(/connect.*(modèle|LLM)|configur.*(modèle|LLM)|connect.*model|clé.*(IA|LLM)|Connecter mon LLM/i).first()).toBeVisible({timeout:90_000});
 await page.screenshot({path:'/private/tmp/stack32-onboarding-preprod-launch-setup.png',fullPage:true});
 await page.goto(base+'/billing/success?mock=true'); await expect(page).toHaveURL(new RegExp('/agents/'+ready.agent_id+'/agent'),{timeout:60_000});
 const launches=await rest('runs?select=id,status,error_code&agent_id=eq.'+ready.agent_id+'&run_type=eq.live');
 if(launches.length!==1) throw new Error('Duplicate launch');
 const result={destination:base,user:account.user_id,agent:ready.agent_id,preparation:'real_builder_ready',version:ready.version_id,graphNodes:version.spec.graph.nodes.length,tools:version.spec.tools.map(t=>t.tool_id),launches,billing:'mock_only',externalActions:'none',checkedAt:new Date().toISOString()};
 await fs.writeFile('/private/tmp/stack32-onboarding-preprod-smoke-result.json',JSON.stringify(result,null,2));
 console.log(JSON.stringify(result));
} catch(error) {
 await page.screenshot({path:'/private/tmp/stack32-onboarding-preprod-error.png',fullPage:true}).catch(()=>{});
 console.error('Preproduction smoke failed:',error.message);
 console.error('Current URL:',page.url());
 process.exitCode=1;
} finally { await browser.close(); }
