/** Public visual smoke: fixed isolated preproduction destination, fresh contexts,
 * no accounts, no purchase, no builder/model or external integration call.
 */
import fs from 'node:fs/promises';
import { chromium, devices, expect } from '@playwright/test';
const base = 'https://pre-prod-659874458xx.stack32.com';
const output = '/private/tmp/stack32-onboarding-presentation';
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch();
const reports = [];
try {
 for (const [name, device, viewport, reducedMotion] of [
  ['phone', devices['iPhone 13'], { width:390, height:844 }, 'no-preference'],
  ['small-phone', devices['iPhone 13'], { width:320, height:740 }, 'reduce'],
  ['tablet-landscape', devices['iPad Pro 11'], { width:1366, height:1024 }, 'no-preference'],
 ]) {
  const { defaultBrowserType, ...options } = device; void defaultBrowserType;
  const context = await browser.newContext({ ...options, viewport, locale:'fr-FR', reducedMotion });
  await context.addCookies([{name:'stack32_consent',value:'{"v":1,"analytics":false,"marketing":false,"ts":4102444800000}',domain:new URL(base).hostname,path:'/',secure:true}]);
  const page = await context.newPage(); const errors=[];
  page.on('pageerror', error => errors.push(error.message));
  const at = async step => expect(page.getByTestId('mobile-onboarding')).toHaveAttribute('data-step',step,{timeout:25000});
  const next = async (label='Continuer') => page.getByRole('button',{name:label,exact:true}).click();
  const choose = async label => { await page.getByRole('radio',{name:label,exact:true}).click(); await next(); };
  const capture = async step => {
   await expect.poll(()=>page.locator('section[aria-labelledby=journey-heading]').evaluate(e=>Number(getComputedStyle(e).opacity))).toBe(1);
   await expect.poll(()=>page.getByTestId('journey-scroll').evaluate(e=>e.getAnimations({subtree:true}).every(a=>a.effect?.getTiming().iterations===Infinity || a.playState==='finished'))).toBe(true);
   await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
   await page.screenshot({path:`${output}/${name}-${step}.png`});
  };
  await page.goto(base+'/onboarding'); await at('definition');
  expect(await page.locator('header').evaluate(e=>getComputedStyle(e).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
  await next("J'ai compris"); await choose("Lancer un business d'agents IA"); await choose('Jamais'); await next();
  await next('Construire mon projet'); await choose('5 à 10 h'); await choose('Dans le mois'); await at('b.target');
  const gauge=page.locator('#income-target'); await gauge.focus(); await gauge.press('Home');
  for(let i=0;i<108;i++) await gauge.press('ArrowRight');
  await expect(page.locator('output')).toContainText('19 000');
  await expect(page.getByText(/Ambitieux|Difficulté indicative|Conservé sur cet appareil/)).toHaveCount(0); await capture('gauge');
  await next(); await choose("Plus d'indépendance"); await at('b.analysis');
  await expect.poll(async()=>Number(await page.getByTestId('circular-preparation').getByRole('progressbar').getAttribute('aria-valuenow'))).toBeGreaterThan(20);
  await page.screenshot({path:`${output}/${name}-circular-progress.png`}); await at('b.suggestions');
  await next('Voir comment en faire une offre'); await choose('Je le propose à plusieurs clients'); await choose('Mon réseau');
  for(const step of ['b.clients','b.describe','b.configure','b.present']) {
   await at(step); await expect(page.getByTestId(`learning-${step}`)).toBeVisible();
   const progress=page.getByRole('progressbar',{name:'Progression du parcours'});
   const top=await progress.evaluate(e=>e.getBoundingClientRect().top);
   await page.getByTestId('journey-scroll').evaluate(e=>{e.scrollTop=e.scrollHeight;});
   expect(await progress.evaluate(e=>e.getBoundingClientRect().top)).toBe(top);
   await page.getByTestId('journey-scroll').evaluate(e=>{e.scrollTop=0;}); await capture(step); await next();
  }
  await at('account'); expect(errors).toEqual([]);
  if(name==='tablet-landscape') {
   await page.setViewportSize({width:1024,height:1366}); await page.reload(); await at('account');
   await page.setViewportSize(viewport); await page.reload(); await at('account');
  }
  reports.push({device:name,width:viewport.width,reducedMotion,publicJourney:'passed',pageErrors:errors,actualPayments:'none'});
  await context.close();
 }
 await fs.writeFile(`${output}/result.json`,JSON.stringify({destination:base,reports},null,2));
 console.log(JSON.stringify({destination:base,passed:true,reports}));
} finally { await browser.close(); }
