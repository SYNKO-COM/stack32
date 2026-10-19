"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Bot, Check, Compass, FlaskConical, Loader2, PenLine, RefreshCw, Rocket, Sparkles, Sprout, Store, TrendingUp, Workflow, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { StructureGraph } from "@/components/builder/structure-graph";
import { AuthForm } from "@/components/auth/auth-form";
import { BrandLoader } from "@/components/shared/brand-loader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useCurrentUser } from "@/hooks/use-auth";
import { useTranslation } from "@/hooks/use-translation";
import { completeMobileCheckpoint, dispatchMobileProject, getMobileProject, launchMobileProject, prepareMobileProject, saveMobileProject, type OnboardingProject, type PreparedSpec } from "@/lib/actions/mobile-onboarding";
import { canContinue, difficulty, euro, guidedBrief, isAutomation, MIN_PREPARATION_MS, MOBILE_RETURN, monthlySales, pathFor, priceBounds, referencePrice, resolveBrief, STEPS, TARGETS, timeProjection, type Journey } from "@/lib/onboarding/journey";
import { claimableJourney, completeJourneyClaim, markJourneyClaim, newJourney, readJourney, writeJourney, type LocalJourney } from "@/lib/onboarding/storage";
import { consumePendingPrompt, getPendingPrompt } from "@/lib/pending-prompt";
import { cn } from "@/lib/utils";
import { toggleSector } from "@/lib/onboarding/journey";

function toolName(id: string) {
  const names: Record<string, string> = { structured_output: "Mise en forme des réponses", web_search: "Recherche Web", fetch_url: "Lecture de pages publiques", knowledge_search: "Recherche dans tes documents", calculator: "Calcul", current_datetime: "Date et heure", gmail_send: "Envoi Gmail", gmail_read: "Lecture Gmail", calendar_create_event: "Création d'un événement" };
  return names[id] ?? id.replace(/^pd:/, "").replace(/[_:]/g, " ");
}

const INFO_CARD_ICONS: Record<string, LucideIcon[]> = {
  "b.beginner": [Sprout, Rocket],
  "b.experienced": [Compass, Rocket],
  "b.business": [Bot, TrendingUp],
  "a.complexity": [Sparkles],
  "a.explain": [Workflow],
  "b.describe": [PenLine],
  "b.configure": [FlaskConical],
  "b.present": [Store],
};

/** Present the existing educational copy in light, staggered cards. */
function InformationCards({ stepId, body, reduced }: { stepId: string; body: string; reduced: boolean }) {
  const paragraphs = body.split("\n\n");
  return <div className="mt-6 grid gap-3" data-testid="onboarding-info-cards">
    {paragraphs.map((paragraph, index) => {
      const Icon = INFO_CARD_ICONS[stepId][index] ?? Sparkles;
      const emphasis = index === paragraphs.length - 1;
      return <motion.div key={paragraph} initial={reduced ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .35, delay: reduced ? 0 : .08 + index * .09, ease: [.22, 1, .36, 1] }} className={cn("relative overflow-hidden rounded-3xl border p-5 sm:p-6", emphasis ? "border-brand/20 bg-gradient-to-br from-brand/10 via-background/90 to-background shadow-[0_8px_30px_-18px_var(--brand)]" : "border-border/70 bg-background/80")}>
        {emphasis && <motion.div aria-hidden="true" className="absolute inset-x-5 top-0 h-px origin-left bg-gradient-to-r from-brand/70 to-transparent" initial={reduced ? false : { scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: .6, delay: .2 }} />}
        <div className="flex items-start gap-3.5">
          <span aria-hidden="true" className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", emphasis ? "bg-brand/12 text-brand" : "bg-muted text-muted-foreground")}><Icon className="size-[18px]" /></span>
          <p className={cn("pt-1 text-base leading-relaxed", emphasis ? "text-foreground" : "text-muted-foreground")}>{paragraph}</p>
        </div>
      </motion.div>;
    })}
  </div>;
}

export function MobileOnboardingFlow() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { i18n } = useTranslation();
  const reducedMotion = useReducedMotion();
  const { data: user, isLoading: userLoading } = useCurrentUser();
  const owner = user?.id ?? null;
  const [local, setLocal] = useState<LocalJourney | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [project, setProject] = useState<OnboardingProject | null>(null);
  const [spec, setSpec] = useState<PreparedSpec | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<"local" | "saving" | "saved" | "error">("local");
  const [authMode, setAuthMode] = useState<"signup" | "login">("signup");
  const [now, setNow] = useState(() => Date.now());
  const heading = useRef<HTMLHeadingElement>(null);
  const accountKey = owner ?? "guest";
  const projectStatus = project?.status;

  useEffect(() => {
    if (userLoading) return;
    let canceled = false;
    const hydrate = async () => {
      try {
        let next: LocalJourney;
        if (owner) {
          const remote = await getMobileProject();
          if (canceled || remote.userId !== owner) return;
          setProject(remote.project); setSpec(remote.spec);
          const cached = readJourney(owner);
          const guest = claimableJourney();
          next = remote.project ? { id: remote.project.id, owner, state: remote.project.state } : cached ?? (guest ? { ...guest, owner } : { ...newJourney(getPendingPrompt() ?? ""), owner });
          if (remote.project?.status === "draft" && cached?.id === next.id && cached.state.updatedAt > next.state.updatedAt) next = cached;
          if (remote.project?.status === "ready" || remote.project?.status === "preparing" || remote.project?.status === "failed") next.state = { ...next.state, step: "build" };
          if (remote.project?.status === "launched") { await dispatchMobileProject(); router.replace(`/agents/${remote.project.agent_id}/agent`); return; }
          if (guest && !remote.project) {
            const saved = await saveMobileProject(next.id, next.state, owner);
            next = { id: saved.id, owner, state: saved.state };
            completeJourneyClaim(owner, next);
            consumePendingPrompt();
          }
        } else next = readJourney(null) ?? newJourney(getPendingPrompt() ?? "");
        if (!canceled) { setLocal(next); writeJourney(next); setLoadedFor(accountKey); setError(null); }
      } catch { if (!canceled) { setError("Impossible de retrouver ton projet. Réessaie pour reprendre sans perdre tes réponses."); setLoadedFor(accountKey); } }
    };
    void hydrate();
    return () => { canceled = true; };
  }, [owner, accountKey, userLoading, router]);

  const state = local?.state;
  const answers = state?.answers ?? {};
  const path = pathFor(answers);
  const storedStep = state?.step ?? "welcome";
  const activeStep = path.includes(storedStep) ? storedStep : "goal";
  const elapsed = project?.preparation_started_at ? now - Date.parse(project.preparation_started_at) : 0;
  const ready = project?.status === "ready" && Boolean(spec) && elapsed >= MIN_PREPARATION_MS;
  const stepId = activeStep === "build" && ready ? "ready" : activeStep;
  const s = STEPS[stepId];
  const index = path.indexOf(stepId);

  const update = (patch: Partial<Journey>) => setLocal(previous => {
    if (!previous) return previous;
    const next = { ...previous, state: { ...previous.state, ...patch, updatedAt: Date.now() } };
    writeJourney(next);
    return next;
  });
  const answer = (key: string, value: string | number | string[]) => update({ answers: { ...answers, [key]: value, ...(key === "b.price" ? { "b.referencePrice": priceBounds(value).initial } : {}) } });

  useEffect(() => {
    if (!local || loadedFor !== accountKey) return;
    if (!owner || pathFor(local.state.answers).indexOf(local.state.step) < pathFor(local.state.answers).indexOf("account")) return;
    if (projectStatus && !["draft", "failed"].includes(projectStatus)) return;
    const timer = setTimeout(() => {
      setSaveStatus("saving");
      void saveMobileProject(local.id, local.state, owner!).then(saved => { setProject(saved); setSaveStatus("saved"); }).catch(() => setSaveStatus("error"));
    }, 900);
    return () => clearTimeout(timer);
  }, [local, loadedFor, accountKey, owner, projectStatus]);

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [stepId]);

  useEffect(() => {
    if (!local || loadedFor !== accountKey || !["welcome", "a.analysis", "b.analysis"].includes(stepId)) return;
    // The synthesis itself is deterministic from the answers, not an invented model call.
    if (stepId === "a.analysis") timeProjection(local.state.answers);
    if (stepId === "b.analysis") guidedBrief(local.state.answers);
    const timer = setTimeout(() => {
      const p = pathFor(local.state.answers);
      update({ step: p[p.indexOf(stepId) + 1] });
    }, stepId === "welcome" ? 3000 : 1800);
    return () => clearTimeout(timer);
    // local answers are fixed on passive screens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepId, loadedFor, accountKey]);

  useEffect(() => {
    if (stepId !== "build" || !owner) return;
    let canceled = false;
    let dispatchedAt = 0;
    const poll = async () => {
      try {
        const result = await getMobileProject();
        if (canceled || result.userId !== owner) return;
        setProject(result.project); setSpec(result.spec); setNow(Date.now());
        if (result.project?.status === "preparing" && Date.now() - dispatchedAt > 15_000) {
          dispatchedAt = Date.now();
          void dispatchMobileProject().catch(() => { /* Next poll can re-dispatch the same queued job. */ });
        }
      } catch { if (!canceled) setError("La connexion a été interrompue. Ton brouillon est conservé ; la vérification reprend automatiquement."); }
    };
    void poll();
    const timer = setInterval(() => void poll(), 2000);
    return () => { canceled = true; clearInterval(timer); };
  }, [stepId, owner]);

  async function continueStep(skip = false) {
    if (!local || busy) return;
    setError(null);
    let nextState = local.state;
    if (skip) nextState = { ...nextState, answers: { ...answers, [s.type === "text" ? stepId : `${stepId}.other`]: "" } };
    const currentPath = pathFor(nextState.answers);
    const nextId = currentPath[currentPath.indexOf(stepId) + 1];
    if (stepId === "ready") {
      setBusy(true);
      try {
        const launch = await launchMobileProject();
        router.push(launch.paywall ? "/billing/plans?onboarding=mobile" : launch.path!);
      } catch { setError("Le lancement n'a pas pu être confirmé. Ton agent est conservé. Réessaie."); }
      finally { setBusy(false); }
      return;
    }
    if (stepId === "account") {
      if (!owner) { markJourneyClaim(local.id); return; }
      setBusy(true);
      try {
        const saved = await saveMobileProject(local.id, { ...nextState, step: nextId, updatedAt: Date.now() }, owner);
        await completeMobileCheckpoint(owner);
        await queryClient.invalidateQueries({ queryKey: ["auth", "profile"] });
        setProject(saved); completeJourneyClaim(owner, { ...local, state: saved.state }); consumePendingPrompt();
        update({ ...saved.state, step: nextId });
      } catch { setError("Ton projet n'a pas pu être sauvegardé. Tes réponses restent sur cet appareil. Réessaie."); }
      finally { setBusy(false); }
      return;
    }
    if (nextId === "build") {
      setBusy(true);
      try {
        await saveMobileProject(local.id, { ...nextState, step: "build", updatedAt: Date.now() }, owner!);
        const prepared = await prepareMobileProject(owner!);
        setProject(prepared); update({ ...nextState, step: "build" });
      } catch (e) { setError(e instanceof Error && e.message === "PLAN_AGENT_LIMIT" ? "La limite d'agents de ton abonnement est atteinte. Ton projet est sauvegardé ; libère une place ou modifie ton abonnement dans l'application avant de réessayer." : "La préparation n'a pas pu démarrer. Tes réponses sont conservées. Réessaie."); }
      finally { setBusy(false); }
      return;
    }
    update({ ...nextState, step: nextId });
  }

  async function retryPreparation() {
    setBusy(true); setError(null);
    try { setProject(await prepareMobileProject(owner!)); }
    catch { setError("La préparation n'a pas abouti. Ton projet reste sauvegardé. Réessaie dans un instant."); }
    finally { setBusy(false); }
  }

  // Mark consent to adopt this anonymous draft only at the authentication checkpoint.
  useEffect(() => { if (stepId === "account" && !owner && local) markJourneyClaim(local.id); }, [stepId, owner, local]);

  useEffect(() => {
    if (stepId === "account" && owner && local && loadedFor === accountKey) void continueStep();
    // This checkpoint runs once after identity hydration. A failed save leaves
    // an explicit retry button; draft refetches must not repeat completion.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepId, owner, loadedFor, accountKey]);

  if (!local || loadedFor !== accountKey || userLoading) return <div className="mx-auto max-w-md py-12">{error ? <><p role="alert">{error}</p><Button className="mt-5" onClick={() => window.location.reload()}>Réessayer</Button></> : <BrandLoader label="Préparation de ton parcours" />}</div>;
  const otherVisible = s.other && (Array.isArray(answers[stepId]) ? (answers[stepId] as string[]).includes("Autre") : answers[stepId] === "Autre");
  const projection = timeProjection(answers);
  // Before an objective is chosen, the three introductory screens are only
  // the beginning of the journey, not a completed three-screen questionnaire.
  const progressTotal = answers.goal ? path.length : pathFor({ goal: STEPS.goal.options![0] }).length;
  const progress = Math.round(((Math.max(0, index) + 1) / progressTotal) * 100);
  const isPassive = s.type === "passive";
  const showBack = index > 1 && !["build", "ready"].includes(stepId);
  const educationalBody = s.body ?? ({ "b.describe": "Pars d'une demande concrète et du résultat attendu.", "b.configure": "Branche les sources utiles et vérifie un premier cas avec les outils disponibles.", "b.present": "Montre ce que ton agent sait faire avec une démonstration adaptée à ton client." } as Record<string, string>)[stepId];

  return <div className="mx-auto w-full max-w-xl pb-[max(1rem,env(safe-area-inset-bottom))]" data-testid="mobile-onboarding" data-step={stepId} lang="fr">
    <div className="sticky top-20 z-30 -mx-6 bg-background/95 px-6 pb-3 pt-2 backdrop-blur-sm">
      <div role="progressbar" aria-label="Progression du parcours" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-brand transition-[width] motion-reduce:transition-none" style={{ width: `${progress}%` }} />
      </div>
      {showBack && <div className="mt-2 flex min-h-10 items-center">
        <Button variant="ghost" size="sm" className="-ml-3 min-h-10 gap-1.5" disabled={busy} onClick={() => update({ step: path.slice(0, index).reverse().find(id => STEPS[id].type !== "passive" && !(owner && id === "account")) ?? "definition" })}><ArrowLeft className="size-4" />Retour</Button>
      </div>}
    </div>
    <span className="sr-only" role="status">{owner && project && saveStatus === "saving" ? "Sauvegarde…" : saveStatus === "error" ? "Sauvegarde à réessayer" : ""}</span>
    <motion.section key={stepId} initial={reducedMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .3, ease: [.22, 1, .36, 1] }} className="pt-5" aria-labelledby="journey-heading">
      {(s.type === "info" || isPassive) && stepId !== "ready" && <motion.div aria-hidden="true" data-testid="onboarding-agent-icon" className="mb-5 w-fit text-brand" initial={reducedMotion ? false : { opacity: 0, scale: .9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: .3 }}><Bot className="size-8" strokeWidth={1.75} /></motion.div>}
      <h1 ref={heading} id="journey-heading" tabIndex={-1} className="text-[clamp(1.65rem,5.6vw,2.25rem)] font-semibold leading-tight tracking-tight outline-none">{s.title}</h1>
      {INFO_CARD_ICONS[stepId] && educationalBody ? <InformationCards stepId={stepId} body={educationalBody} reduced={Boolean(reducedMotion)} /> : s.body && <p className="mt-4 whitespace-pre-line text-base leading-relaxed text-muted-foreground">{s.body}</p>}

      {(s.type === "choice" || s.type === "multi") && <div className="mt-7 grid gap-3" role={s.type === "choice" ? "radiogroup" : "group"} aria-labelledby="journey-heading">
        {s.options?.map((option) => {
          const selected = s.type === "multi" ? Array.isArray(answers[stepId]) && (answers[stepId] as string[]).includes(option) : answers[stepId] === option;
          return <button key={option} type="button" role={s.type === "choice" ? "radio" : "checkbox"} aria-checked={selected} onClick={() => answer(stepId, s.type === "multi" ? toggleSector((answers[stepId] as string[]) ?? [], option) : option)} className={cn("flex min-h-14 items-center justify-between gap-4 rounded-2xl border bg-background/80 px-5 py-4 text-left text-base leading-snug transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand", selected ? "border-brand bg-brand/10" : "border-border hover:border-brand/40")}>
            <span>{option}</span><span className={cn("flex size-5 shrink-0 items-center justify-center border", s.type === "multi" ? "rounded-md" : "rounded-full", selected ? "border-brand bg-brand text-white" : "border-muted-foreground/40")}>{selected && <Check className="size-3.5" />}</span>
          </button>;
        })}
      </div>}
      {(s.type === "text" || otherVisible) && <div className="mt-6"><label className="sr-only" htmlFor="journey-answer">{s.type === "text" ? s.title : "Précision facultative"}</label><Textarea id="journey-answer" rows={5} maxLength={4000} value={String(answers[s.type === "text" ? stepId : `${stepId}.other`] ?? "")} onChange={event => answer(s.type === "text" ? stepId : `${stepId}.other`, event.target.value)} className="min-h-36 rounded-2xl bg-background/80 text-base" placeholder="Tu peux aussi passer cette étape." /></div>}

      {s.type === "gauge" && <div className="mt-9 space-y-6">
        <output htmlFor="income-target" className="block text-center text-5xl font-semibold tracking-tight text-brand">{euro(Number(answers["b.target"] ?? 1000))}</output>
        <input id="income-target" aria-label={s.title} aria-valuetext={`${euro(Number(answers["b.target"] ?? 1000))} par mois`} type="range" min={0} max={190} step={1} value={TARGETS.indexOf(Number(answers["b.target"] ?? 1000))} onChange={e => answer("b.target", TARGETS[Number(e.target.value)])} className="min-h-11 w-full accent-brand" />
        <div className="flex justify-between text-sm text-muted-foreground"><span>1 000 €</span><span>60 000 €</span></div>
        <p className="text-center text-xl font-medium">{difficulty(answers)}</p><p className="text-sm leading-relaxed text-muted-foreground">Difficulté indicative selon ton temps disponible : des seuils de cap, pas une probabilité de gains.</p>
      </div>}

      {["a.suggestion", "a.projection"].includes(stepId) && <div className="mt-6 space-y-4 rounded-3xl border border-brand/20 bg-background/70 p-5">
        {stepId === "a.suggestion" && <p>Un agent qui prépare le traitement de {String(answers["a.tasks"] || "la tâche que tu choisiras").split(/[\n;]/)[0]}{answers["a.tools"] ? ` avec les informations issues de ${answers["a.tools"]}` : ", à partir des informations que tu lui fourniras"}.</p>}
        <p className="text-sm text-muted-foreground">Aujourd’hui</p><p className="text-xl font-medium">{projection.current}</p><ArrowRight className="size-5 text-brand" aria-hidden="true" /><p className="text-lg font-medium text-brand">{projection.target}</p><p className="text-sm leading-relaxed text-muted-foreground">{projection.assumptions}</p>
      </div>}
      {stepId === "b.suggestions" && <ul className="mt-6 space-y-4">{(answers["b.time"] === "Moins de 2 h" ? [["Réponses clients", "Préparer une réponse à une question fréquente d'un client."], ["Production de contenu", "Transformer le brief d'un indépendant en brouillon de publication."]] : [["Réponses clients", "Classer une demande et proposer une réponse à valider."], ["Qualification de prospects", "Résumer un besoin entrant et repérer les informations manquantes."], ["Suivi commercial", "Préparer le prochain suivi d'un échange fourni."]]).map(([title, body]) => <li key={title} className="rounded-2xl border border-border bg-background/70 p-5"><h2 className="font-medium">{title}</h2><p className="mt-2 text-sm text-muted-foreground">{body}</p></li>)}</ul>}
      {stepId === "b.clients" && <p className="mt-5 rounded-2xl bg-brand/10 p-5 text-sm leading-relaxed">{({ "Mon réseau": "Commence par une personne de ton réseau dont tu connais le besoin.", "Prospection directe": "Choisis une entreprise précise et prépare une prise de contact personnelle, sans envoi massif.", "Contenu et réseaux sociaux": "Publie un exemple de problème résolu et propose une démonstration aux personnes intéressées.", "Plateformes freelance": "Présente un cas simple et réponds à une demande correspondant à ton agent.", "J'ai besoin d'aide": "Choisis un professionnel de ton entourage, observe une tâche répétitive et propose-lui un test avec son accord." } as Record<string, string>)[String(answers["b.acquisition"])]}</p>}
      {["b.projection", "b.scenario"].includes(stepId) && <div className="mt-7 space-y-5 rounded-3xl border border-brand/20 bg-background/70 p-5">
        <p className="text-sm text-muted-foreground">Point de départ <span aria-hidden="true">→</span> Dans 3 mois</p><p className="text-4xl font-semibold tracking-tight text-brand">{euro(Number(answers["b.target"] ?? 1000))}<span className="mt-1 block text-base font-normal text-muted-foreground">par mois · ton objectif</span></p>
        {s.type === "scenario" && <><label htmlFor="reference-price" className="block text-sm font-medium">Prix de référence par vente d’agent</label><Input id="reference-price" type="number" inputMode="decimal" min={priceBounds(answers["b.price"]).min} max={priceBounds(answers["b.price"]).max} step="any" value={answers["b.referencePrice"] ?? priceBounds(answers["b.price"]).initial} onChange={e => answer("b.referencePrice", e.target.value)} onBlur={() => answer("b.referencePrice", referencePrice(answers))} className="min-h-12 text-base" /><p className="text-sm text-muted-foreground">Fourchette choisie : {String(answers["b.price"])}. Hypothèse : ventes d’agents à ce prix.</p><p className="text-xl font-medium">{monthlySales(answers) === null ? "Fixe un prix positif dans ta fourchette pour calculer le nombre de ventes." : `${monthlySales(answers)} ventes nécessaires par mois à ${euro(referencePrice(answers))}`}</p><p className="text-sm text-muted-foreground">Un scénario de ventes pour avancer vers ton cap ; il ne suppose ni ventes déjà réalisées ni abonnements récurrents.</p></>}
      </div>}
      {["a.plan", "b.plan"].includes(stepId) && <div className="mt-6 rounded-2xl border border-brand/20 bg-background/70 p-5"><p className="whitespace-pre-wrap text-sm leading-relaxed">{isAutomation(answers) ? String(answers["a.request"] || answers["a.tasks"] || "Un premier cas fourni par toi, à tester avant de l'automatiser.") : answers["b.hasIdea"] === "Oui" && String(answers["b.idea"] ?? "").trim() ? String(answers["b.idea"]) : guidedBrief(answers)}</p><p className="mt-4 text-sm text-muted-foreground">{isAutomation(answers) ? `${answers["a.output"] ?? "Résultat à valider"} · ${answers["a.control"] ?? "Validation humaine"} · ${answers["a.success"] ?? "Test sur un cas réel"}` : `${answers["b.client"] ?? "Client à préciser"} · ${answers["b.problem"] ?? "Besoin à tester"} · ${Array.isArray(answers["b.sectors"]) ? (answers["b.sectors"] as string[]).join(", ") : "Secteur à explorer"}`}</p></div>}

      {s.type === "auth" && <div className="mt-7">{owner ? <p className="text-sm text-muted-foreground">Tu es connecté. Sauvegardons ton projet pour continuer.</p> : <AuthForm mode={authMode} onModeChange={setAuthMode} preferredNext={MOBILE_RETURN} />}</div>}
      {stepId === "build" && <div className="mt-6 space-y-5">
        <p className="text-muted-foreground" role="status">{project?.status === "failed" ? "La préparation n'a pas abouti. Ton brouillon et tes réponses sont conservés." : spec ? "La mission et les branches sont préparées. Nous terminons leur présentation." : elapsed >= MIN_PREPARATION_MS ? "La préparation réelle prend un peu plus de temps. Nous attendons sa confirmation." : ["Préparation de la mission à partir de tes réponses…", "Organisation des décisions et des branches…", "Sélection des outils disponibles…", "Vérification du brouillon et des connexions à configurer…"][Math.min(3, Math.floor(elapsed / 12500))]}</p>
        <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-brand transition-[width] motion-reduce:transition-none" style={{ width: `${spec ? Math.min(100, elapsed / MIN_PREPARATION_MS * 100) : Math.min(92, elapsed / MIN_PREPARATION_MS * 92)}%` }} /></div>
        {(project?.status === "failed" || elapsed > 90_000 && !spec) && <Button className="h-12 w-full rounded-full" disabled={busy} onClick={() => void retryPreparation()}><RefreshCw className="mr-2 size-4" />Réessayer</Button>}
      </div>}
      {stepId === "ready" && spec && <div className="mt-6 space-y-5"><StructureGraph agentId={project!.agent_id!} graph={spec.graph} readOnly /><ul className="space-y-2">{spec.tools.map(t => <li key={t.tool_id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background/70 px-4 py-3 text-sm"><span className="break-words">{toolName(t.tool_id)}</span><span className="shrink-0 text-xs text-muted-foreground">{t.approval_mode === "always" ? "À valider" : "Outil préparé"}</span></li>)}</ul><p className="text-sm leading-relaxed text-muted-foreground">Le brouillon est préparé. Avant une action, l’application demandera les connexions, le modèle et les permissions encore nécessaires. Aucun outil externe n’a été exécuté pendant cette préparation.</p><details><summary className="cursor-pointer text-sm text-brand">Voir la mission préparée</summary><p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">{project?.brief ?? resolveBrief(local.state)}</p></details></div>}
    </motion.section>

    {error && <p role="alert" className="mt-5 rounded-xl border border-destructive/30 p-4 text-sm text-destructive">{error}</p>}
    {saveStatus === "error" && <Button variant="link" onClick={() => { void saveMobileProject(local.id, local.state, owner!).then(saved => { setProject(saved); setSaveStatus("saved"); }).catch(() => setSaveStatus("error")); }}>Réessayer la sauvegarde</Button>}
    {!isPassive && (s.type !== "auth" || owner) && <div className="mt-8 flex flex-col items-center gap-2">
      <Button className="min-h-12 w-full max-w-sm rounded-full px-6 text-base" disabled={busy || !canContinue(s, answers)} onClick={() => void continueStep()}>{busy ? <Loader2 className="mr-2 size-4 animate-spin motion-reduce:animate-none" /> : null}{s.action ?? "Continuer"}</Button>
      {(s.type === "text" || otherVisible) && <Button variant="ghost" className="min-h-11 text-muted-foreground" disabled={busy} onClick={() => void continueStep(true)}>Passer cette étape</Button>}
    </div>}
    {/* The exact validated French copy is authoritative; language switching keeps every answer. */}
    {i18n.language.startsWith("en") && <span className="sr-only">French onboarding journey</span>}
  </div>;
}
