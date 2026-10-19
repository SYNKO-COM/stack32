import { devices, expect, test, type Page } from "@playwright/test";

const api = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
if (!["localhost", "127.0.0.1"].includes(new URL(api).hostname)) throw new Error("LOCAL_TESTS_ONLY");
const secret = process.env.E2E_SUPABASE_SECRET_KEY ?? "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz";
const password = "Journey-Test-123!";
const { defaultBrowserType: phoneEngine, ...phone } = devices["iPhone 13"];
const { defaultBrowserType: tabletEngine, ...tabletDevice } = devices["iPad Pro 11"];
void phoneEngine; void tabletEngine;
async function rest(path: string, method = "GET", body?: unknown) {
  const res = await fetch(`${api}/${path}`, { method, headers: { apikey: secret, Authorization: `Bearer ${secret}`, "Content-Type": "application/json", Prefer: "return=representation" }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!res.ok) throw new Error(`Local fixture failed: ${res.status}`);
  return res.status === 204 ? null : res.json();
}
async function userFixture() {
  const email = `journey-${Date.now()}-${Math.random().toString(16).slice(2, 6)}@stack32.test`;
  const user = await rest("auth/v1/admin/users", "POST", { email, password, email_confirm: true });
  return { id: user.id as string, email };
}
async function next(page: Page, name = "Continuer") { await page.getByRole("button", { name, exact: true }).click(); }
async function choice(page: Page, value: string) { await page.getByRole("radio", { name: value, exact: true }).click(); await next(page); }
async function at(page: Page, id: string) { await expect(page.getByTestId("mobile-onboarding")).toHaveAttribute("data-step", id, { timeout: 20_000 }); }
async function loginCheckpoint(page: Page, email: string) {
  await at(page, "account");
  await page.getByRole("button", { name: /sign in|se connecter/i }).click();
  await page.getByLabel(/email/i).fill(email);
  await page.locator("#auth-password").fill(password);
  await page.locator("form").getByRole("button", { name: /sign in|se connecter/i }).click();
  await expect(page.getByTestId("mobile-onboarding")).toHaveAttribute("data-step", /^(a|b)\.projection$/, { timeout: 20_000 });
}
async function begin(page: Page, withPrompt = false) {
  await page.goto(withPrompt ? "/" : "/onboarding");
  if (withPrompt) {
    await page.getByTestId("builder-composer").fill("Préparer mes réponses clients à partir de leurs demandes.");
    await expect(page.getByRole("button", { name: /envoyer|send/i, exact: true })).toBeEnabled();
    await page.getByTestId("builder-composer").press("Enter");
  }
  await at(page, "welcome");
  await at(page, "definition");
  await next(page, "J'ai compris");
  await at(page, "goal");
  await expect(page.getByRole("button", { name: "Continuer", exact: true })).toBeDisabled();
}

test.describe("mobile journey — real local persistence, deterministic builder fixture, mocked payment", () => {
  test.use({ ...phone, locale: "fr-FR" });
  test("A: optional text, auth, real draft record, 50 seconds, cancellation and single paid launch", async ({ page }) => {
    test.setTimeout(240_000);
    page.on("pageerror", error => console.error("Browser error:", error.message));
    const user = await userFixture();
    await begin(page, true);
    await choice(page, "Automatiser mon activité");
    await choice(page, "Autre");
    await at(page, "a.experience");
    await choice(page, "J'ai essayé");
    await page.locator("#journey-answer").fill("Répondre aux demandes clients\nClasser les factures");
    await next(page);
    await choice(page, "Chaque jour"); await choice(page, "15 à 30 min");
    await next(page, "Passer cette étape");
    await choice(page, "Trop compliqué, pas les compétences");
    await at(page, "a.complexity"); await next(page);
    await choice(page, "Gagner du temps");
    await at(page, "a.analysis");
    const analysisStart = Date.now();
    await expect(page.getByTestId("circular-preparation")).toBeVisible();
    await at(page, "a.suggestion");
    expect(Date.now() - analysisStart).toBeGreaterThan(10_000);
    await expect(page.getByText(/50 % de temps économisé/)).toBeVisible();
    await next(page); await at(page, "a.explain"); await next(page);
    await loginCheckpoint(page, user.email);
    await at(page, "a.projection");
    await page.reload(); await at(page, "a.projection");
    await expect(page.getByText(/Environ 113 min/)).toBeVisible();
    await next(page);
    await page.locator("#journey-answer").fill("Préparer une réponse à la demande client fournie et me la faire valider.");
    await next(page); await choice(page, "Une réponse prête à valider"); await choice(page, "Avant chaque envoi"); await choice(page, "Temps gagné");
    await at(page, "a.plan"); await next(page); await at(page, "build");
    const [project] = await rest(`rest/v1/onboarding_projects?user_id=eq.${user.id}&select=*`);
    expect(project.agent_id).toBeTruthy();
    await page.reload(); await at(page, "build");
    const [reloaded] = await rest(`rest/v1/onboarding_projects?user_id=eq.${user.id}&select=*`);
    expect(reloaded.agent_id).toBe(project.agent_id);
    expect(reloaded.brief).toContain("Avant chaque envoi");
    await expect(page.getByRole("button", { name: "Utiliser cet agent" })).toHaveCount(0);
    await expect(page.getByTestId("prepared-agent-structure")).toBeVisible({ timeout: 15_000 });
    await page.screenshot({ path: test.info().outputPath("building-current-structure.png") });
    await at(page, "ready").catch(async () => { await expect(page.getByTestId("mobile-onboarding")).toHaveAttribute("data-step", "ready", { timeout: 60_000 }); });
    expect(Date.now() - Date.parse(project.preparation_started_at)).toBeGreaterThanOrEqual(50_000);
    await expect(page.getByTestId("prepared-agent-structure").locator(".react-flow__node-agent")).toBeVisible();
    await expect(page.getByTestId("prepared-agent-structure").locator(".react-flow__controls")).toHaveCount(0);
    const central = await page.locator('.react-flow__node[data-id="agent"]').boundingBox();
    const model = await page.locator('.react-flow__node[data-id="attachment:model"]').boundingBox();
    expect(model!.x + model!.width).toBeLessThan(central!.x);
    await expect(page.getByText("Voir la mission préparée")).toHaveCount(0);
    await page.screenshot({ path: test.info().outputPath("ready-current-structure.png") });
    await next(page, "Utiliser cet agent");
    await expect(page).toHaveURL(/billing\/plans/, { timeout: 30_000 });
    await expect(page.getByRole("button", { name: /gratuit|free/i })).toHaveCount(0);
    await page.goto("/billing/success?status=canceled");
    await expect(page.getByRole("link", { name: "Revenir à mon agent" })).toHaveCount(0);
    await page.getByRole("link", { name: /offres|pricing/i }).click();
    await expect(page).toHaveURL(/billing\/plans/);
    await expect(page.getByRole("button", { name: /revenir à mon agent/i })).toHaveCount(0);
    const launchBefore = await rest(`rest/v1/runs?agent_id=eq.${project.agent_id}&run_type=eq.live&select=id`);
    expect(launchBefore).toHaveLength(0);
    // Explicit local mock entitlement, never a live Whop purchase.
    await page.goto("/api/billing/mock-activate?plan=starter&interval=monthly&credits=100");
    await expect(page).toHaveURL(new RegExp(`/agents/${project.agent_id}/agent`), { timeout: 60_000 });
    await page.goto("/billing/success?mock=true");
    await expect(page).toHaveURL(new RegExp(`/agents/${project.agent_id}/agent`), { timeout: 60_000 });
    expect(await rest(`rest/v1/runs?agent_id=eq.${project.agent_id}&run_type=eq.live&select=id`)).toHaveLength(1);
  });

  test("B: prompt survives auth, edited idea overrides it, exclusive sectors and exact projection", async ({ page }) => {
    test.setTimeout(120_000);
    page.on("pageerror", error => console.error("Browser error:", error.message));
    const user = await userFixture();
    await begin(page, true); await choice(page, "Gagner de l'argent grâce aux agents IA");
    await choice(page, "Oui, j'en ai déjà créé"); await at(page, "b.experienced"); await next(page);
    await next(page, "Construire mon projet"); await choice(page, "5 à 10 h"); await choice(page, "Dans le mois");
    await page.locator("#income-target").focus(); await page.locator("#income-target").press("Home");
    for (let i = 0; i < 91; i++) await page.locator("#income-target").press("ArrowRight");
    await expect(page.locator("output")).toContainText("10 500"); await next(page);
    await choice(page, "Plus d'indépendance"); await at(page, "b.suggestions"); await next(page, "Voir comment en faire une offre");
    await choice(page, "Je le propose à plusieurs clients"); await choice(page, "J'ai besoin d'aide"); await at(page, "b.clients"); await next(page);
    for (const id of ["b.describe", "b.configure", "b.present"]) { await at(page, id); await next(page); }
    await loginCheckpoint(page, user.email); await at(page, "b.projection");
    await expect(page.getByTestId("goal-projection").getByLabel(/10\s500\s€ par mois/).locator("span").first()).toHaveText(/10\s500\s€/);
    await page.getByRole("button", { name: "Désactiver le son" }).click();
    await expect(page.getByRole("button", { name: "Activer le son" })).toHaveAttribute("aria-pressed", "false");
    await page.screenshot({ path: test.info().outputPath("financial-projection.png") }); await next(page);
    await page.getByRole("checkbox", { name: "Commerce", exact: true }).click();
    await page.getByRole("checkbox", { name: "Je n'ai pas de préférence", exact: true }).click();
    await expect(page.getByRole("checkbox", { name: "Commerce", exact: true })).toHaveAttribute("aria-checked", "false"); await next(page);
    await choice(page, "TPE"); await choice(page, "Répondre plus vite"); await choice(page, "Entre 0 et 500 €"); await choice(page, "Oui");
    await expect(page.locator("#journey-answer")).toHaveValue("Préparer mes réponses clients à partir de leurs demandes.");
    await page.locator("#journey-answer").fill("Classer les demandes et rédiger un brouillon concis.");
    await page.reload(); await at(page, "b.idea");
    await expect(page.locator("#journey-answer")).toHaveValue("Classer les demandes et rédiger un brouillon concis.");
    await next(page); await page.screenshot({ path: test.info().outputPath("departure-plan.png") }); await next(page, "Voir mon scénario");
    await expect(page.locator("#reference-price")).toHaveCount(0);
    await expect(page.getByText(/21 ventes nécessaires par mois à/)).toBeVisible();
    await page.screenshot({ path: test.info().outputPath("fixed-scenario.png") });
    await next(page, "Préparer mon agent"); await at(page, "build");
    const [project] = await rest(`rest/v1/onboarding_projects?user_id=eq.${user.id}&select=*`);
    expect(project.brief).toContain("Classer les demandes et rédiger un brouillon concis.");
    expect(project.brief).not.toContain("Préparer mes réponses clients à partir de leurs demandes.");
    expect(project.state.answers["b.target"]).toBe(10500);
  });
});

test("large iPad keeps branch and answers across portrait/landscape; desktop retains its free plan", async ({ browser, page }) => {
  const context = await browser.newContext({ ...tabletDevice, viewport: { width: 1024, height: 1366 }, locale: "fr-FR" });
  const tablet = await context.newPage();
  await tablet.goto("http://localhost:3100/onboarding");
  await at(tablet, "definition"); await next(tablet, "J'ai compris"); await choice(tablet, "Automatiser mon activité");
  await tablet.getByRole("radio", { name: "Association", exact: true }).click();
  await tablet.setViewportSize({ width: 1366, height: 1024 }); await tablet.reload();
  await at(tablet, "a.activity"); await expect(tablet.getByRole("radio", { name: "Association", exact: true })).toHaveAttribute("aria-checked", "true");
  await tablet.setViewportSize({ width: 1024, height: 1366 }); await tablet.reload(); await at(tablet, "a.activity");
  await expect.poll(() => tablet.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1024);
  await tablet.goto("http://localhost:3100/pricing"); await expect(tablet.getByRole("heading", { name: /free|gratuit/i, exact: true })).toHaveCount(0);
  await context.close();
  await page.goto("/pricing"); await expect(page.getByRole("heading", { name: /free|gratuit/i, exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto("/onboarding");
  await expect(page.getByTestId("mobile-onboarding")).toHaveCount(0);
  await expect(page.getByLabel(/email/i)).toBeVisible();
});
