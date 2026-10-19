"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Bot, BrainCircuit, CheckCheck, CircleDollarSign, FileText, Handshake, MessageSquare, Play, Plug, ScanLine, ShieldCheck, Sparkles, Target, Users, Volume2, VolumeX, WandSparkles, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { euro, isAutomation, monthlySales, referencePrice, type Answers } from "@/lib/onboarding/journey";
import { cn } from "@/lib/utils";
import "./journey-visuals.css";

/** Short procedural chime, created locally; no external audio or sale event. */
export function useJourneySound() {
  const context = useRef<AudioContext | null>(null);
  const [enabled, setEnabled] = useState(true);
  useEffect(() => () => { void context.current?.close(); }, []);
  function enable() {
    if (!context.current) context.current = new AudioContext();
    void context.current.resume().catch(() => {});
  }
  function chime() {
    const audio = context.current;
    if (!enabled || !audio || audio.state !== "running") return;
    [659.25, 880, 1318.5].forEach((frequency, i) => {
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      const start = audio.currentTime + i * .09;
      oscillator.type = "sine"; oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(.035, start + .015); gain.gain.exponentialRampToValueAtTime(.001, start + .32);
      oscillator.connect(gain); gain.connect(audio.destination);
      oscillator.start(start); oscillator.stop(start + .33);
    });
  }
  return { enabled, chime, prime: () => { if (enabled) { try { enable(); } catch { /* Audio is optional. */ } } }, toggle: () => { try { enable(); setEnabled(value => !value); } catch { setEnabled(false); } } };
}

const phases: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: Target, title: "Ton objectif", body: "Nous reprenons tes réponses." },
  { icon: BrainCircuit, title: "Les possibilités", body: "Nous relions ton temps et ton expérience." },
  { icon: WandSparkles, title: "Ta première piste", body: "Nous organisons un point de départ adapté." },
  { icon: CheckCheck, title: "Tout est en place", body: "Découvre les pistes à explorer." },
];
export function CircularPreparation({ progress, build = false }: { progress: number; build?: boolean }) {
  const reduced = useReducedMotion();
  const safe = Number.isFinite(progress) ? Math.max(0, Math.min(100, Math.round(progress))) : 0;
  const phase = Math.min(3, Math.floor(safe / 26));
  const Icon = build ? [FileText, BrainCircuit, Plug, ShieldCheck][phase] : phases[phase].icon;
  const labels = build ? ["La mission", "Les branches", "Les outils", "La vérification"] : phases.map(p => p.title);
  return <div className={cn("text-center", build ? "mt-5" : "mt-8")} data-testid="circular-preparation">
    <div className={cn("relative mx-auto", build ? "size-28" : "size-44")} role="progressbar" aria-label={build ? "Préparation de l’agent" : "Préparation des pistes"} aria-valuemin={0} aria-valuemax={100} aria-valuenow={safe}>
      <svg viewBox="0 0 120 120" className="absolute inset-0 size-full -rotate-90" aria-hidden="true"><circle cx="60" cy="60" r="54" fill="none" stroke="currentColor" className="text-brand/10" strokeWidth="4" /><circle cx="60" cy="60" r="54" fill="none" stroke="currentColor" className="text-brand transition-[stroke-dashoffset] duration-300 motion-reduce:transition-none" strokeWidth="4" strokeLinecap="round" strokeDasharray="339.3" strokeDashoffset={339.3 * (1 - safe / 100)} /></svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2"><AnimatePresence mode="wait"><motion.span key={phase} initial={reduced ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}><Icon className={cn("text-brand", build ? "size-7" : "size-10")} /></motion.span></AnimatePresence><span className="text-sm font-medium tabular-nums">{safe} %</span></div>
    </div>
    <AnimatePresence mode="wait"><motion.div key={phase} initial={reduced ? false : { opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-4" aria-live="polite"><p className="text-lg font-medium">{labels[phase]}</p>{!build && <p className="mt-1 text-sm text-muted-foreground">{phases[phase].body}</p>}</motion.div></AnimatePresence>
    {!build && <div className="mt-6 flex justify-center gap-2" aria-hidden="true">{phases.map((p, i) => <span key={p.title} className={cn("flex size-9 items-center justify-center rounded-xl transition-colors", i <= phase ? "bg-brand/10 text-brand" : "text-muted-foreground/35")}><p.icon className="size-4" /></span>)}</div>}
  </div>;
}

/** Four different teaching compositions, all using the validated learning copy. */
export function LearningScene({ stepId, hint }: { stepId: string; hint?: string }) {
  return <div className="journey-learning mt-6" data-testid={`learning-${stepId}`}>
    {stepId === "b.describe" && <div className="rounded-3xl border border-brand/20 bg-background/80 p-5 shadow-sm"><span className="mb-4 flex items-center gap-2 text-xs font-medium text-brand"><MessageSquare className="size-4" />Une demande concrète</span><div className="journey-arrive ml-5 rounded-2xl rounded-tr-sm bg-brand/10 p-4 text-sm">Prépare une réponse à cette demande client.</div><div className="journey-arrive mt-4 flex items-start gap-3 rounded-2xl border border-border p-4 [animation-delay:180ms]"><Bot className="size-5 shrink-0 text-brand" /><div><p className="text-sm font-medium">Un résultat précis</p><p className="mt-1 text-sm text-muted-foreground">Un brouillon clair, prêt à valider.</p></div></div><p className="mt-5 text-sm leading-relaxed text-muted-foreground">Pars d&apos;une demande concrète et du résultat attendu.</p></div>}
    {stepId === "b.configure" && <div className="rounded-3xl border border-border bg-background/75 p-5"><div className="flex items-center justify-between"><span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Ton premier test</span><ScanLine className="size-5 text-brand" /></div><div className="mt-5 space-y-3">{[[Plug, "Branche tes sources", "Les informations utiles"], [Play, "Teste un cas", "Une demande que tu connais"], [CheckCheck, "Améliore la réponse", "Vérifie le résultat"]].map(([Icon, title, text], i) => { const ItemIcon = Icon as LucideIcon; return <div key={String(title)} className="journey-arrive flex items-center gap-3" style={{ animationDelay: `${i * 160}ms` }}><span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-brand/10 text-brand"><ItemIcon className="size-5" /></span><div className="flex-1 border-b border-border/60 py-2"><p className="text-sm font-medium">{String(title)}</p><p className="text-xs text-muted-foreground">{String(text)}</p></div></div>; })}</div><p className="mt-5 text-sm leading-relaxed text-muted-foreground">Branche les sources utiles et vérifie un premier cas avec les outils disponibles.</p></div>}
    {stepId === "b.present" && <div className="relative rounded-3xl border border-brand/20 bg-gradient-to-br from-brand/10 to-background p-6"><div className="journey-arrive mx-auto max-w-[260px] rounded-2xl border border-border bg-background p-5 shadow-sm"><Bot className="mb-4 size-8 text-brand" /><p className="text-lg font-medium">Ton agent. Une vraie solution.</p><div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground"><Play className="size-4 text-brand" />Une démonstration concrète</div></div><div className="journey-arrive mx-auto mt-4 flex w-fit items-center gap-2 rounded-full bg-brand/10 px-4 py-2 text-sm [animation-delay:240ms]"><Handshake className="size-4 text-brand" />Ta première offre</div><p className="mt-5 text-sm leading-relaxed text-muted-foreground">Montre ce que ton agent sait faire avec une démonstration adaptée à ton client.</p></div>}
    {stepId === "b.clients" && <div className="space-y-4"><div className="flex items-center gap-3 rounded-3xl bg-brand/10 p-5"><Users className="size-9 shrink-0 text-brand" /><p className="text-base font-medium">Un besoin précis.<br />Une personne à aider.</p></div><div className="ml-5 space-y-0 border-l border-brand/25 pl-5">{["Montre un cas d’usage", "Propose une démonstration", "Échange avec ton premier client"].map((label, i) => <p key={label} className="journey-arrive flex items-center gap-3 py-3 text-sm" style={{ animationDelay: `${i * 160}ms` }}><span className="text-brand">0{i + 1}</span>{label}</p>)}</div>{hint && <p className="rounded-2xl border border-border bg-background/70 p-4 text-sm leading-relaxed text-muted-foreground">{hint}</p>}</div>}
  </div>;
}

export function GoalProjection({ answers, scenario = false, sound }: { answers: Answers; scenario?: boolean; sound: ReturnType<typeof useJourneySound> }) {
  const target = Number(answers["b.target"] ?? 1000);
  const reduced = useReducedMotion();
  const [amount, setAmount] = useState(reduced ? target : 0);
  const [complete, setComplete] = useState(false);
  const chime = useRef(sound.chime);
  useEffect(() => { chime.current = sound.chime; });
  useEffect(() => {
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = reduced ? 1 : Math.max(0, Math.min(1, (now - start - 350) / 1600));
      setAmount(Math.round(target * (1 - Math.pow(1 - progress, 3))));
      if (progress < 1) frame = requestAnimationFrame(tick);
      else { setComplete(true); chime.current(); }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, reduced]);
  return <div className="journey-arrive relative mt-6 overflow-hidden rounded-3xl border border-brand/25 bg-gradient-to-br from-brand/10 via-background/85 to-background p-5 sm:p-6" data-testid="goal-projection">
    <div className="flex items-center justify-between gap-3"><p className="text-sm font-medium text-muted-foreground">Ton objectif · dans 3 mois</p><button type="button" onClick={sound.toggle} className="flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-brand/10" aria-label={sound.enabled ? "Désactiver le son" : "Activer le son"} aria-pressed={sound.enabled}>{sound.enabled ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}</button></div>
    <div className="mt-3 flex flex-wrap items-baseline gap-x-2" aria-label={`${euro(target)} par mois`}><span aria-hidden="true" className="text-[clamp(2rem,9vw,3.4rem)] font-semibold tracking-tighter text-brand tabular-nums">{euro(amount)}</span><span aria-hidden="true" className="whitespace-nowrap text-sm text-muted-foreground">/ mois</span></div>
    <div className="mt-6 flex h-16 items-end gap-2" aria-hidden="true">{[22, 35, 32, 55, 66, 78, 100].map((height, i) => <span key={i} className="journey-bar flex-1 rounded-t-md bg-gradient-to-t from-brand/25 to-brand/80" style={{ height: `${height}%`, animationDelay: `${150 + i * 85}ms` }} />)}</div>
    {complete && <span className="journey-arrive pointer-events-none absolute right-6 top-24 text-brand/50" aria-hidden="true"><Sparkles className="size-6" /></span>}
    {scenario ? <><div className="mt-6 grid grid-cols-2 gap-3"><div className="rounded-2xl bg-background/80 p-4"><CircleDollarSign className="mb-2 size-5 text-brand" /><p className="text-xl font-semibold">{euro(referencePrice(answers))}</p><p className="mt-1 text-xs text-muted-foreground">Hypothèse par vente</p></div><div className="rounded-2xl bg-background/80 p-4"><Target className="mb-2 size-5 text-brand" /><p className="text-xl font-semibold">{monthlySales(answers)}</p><p className="mt-1 text-xs text-muted-foreground">Ventes nécessaires / mois</p></div></div><p className="mt-4 text-xs leading-relaxed text-muted-foreground">Scénario : {monthlySales(answers)} ventes nécessaires par mois à {euro(referencePrice(answers))}, dans la fourchette {String(answers["b.price"])}. Un cap à construire, pas des ventes déjà réalisées.</p></> : <p className="mt-4 text-sm text-muted-foreground">Un agent utile, un premier test, puis une offre à proposer.</p>}
  </div>;
}

export function DeparturePlan({ answers }: { answers: Answers }) {
  const automation = isAutomation(answers);
  const mission = String(automation ? answers["a.request"] || answers["a.tasks"] || "Une première tâche à tester" : answers["b.hasIdea"] === "Oui" && String(answers["b.idea"] ?? "").trim() ? answers["b.idea"] : answers["b.guided"] || answers["b.problem"] || "Un agent de réponses clients");
  return <div className="mt-5 space-y-4"><div className="journey-arrive rounded-3xl border border-brand/20 bg-brand/5 p-5"><span className="text-xs font-medium uppercase tracking-widest text-brand">Ton point de départ</span><p className="mt-3 line-clamp-4 break-words text-lg font-medium leading-snug">{mission}</p>{!automation && <p className="mt-3 text-sm text-muted-foreground">Pour {String(answers["b.client"] || "tes premiers clients")}</p>}</div><div className="grid grid-cols-3 gap-2">{(automation ? [[FileText, "Préparer"], [ShieldCheck, "Valider"], [CheckCheck, "Améliorer"]] : [[Bot, "Créer"], [Play, "Tester"], [Handshake, "Vendre"]]).map(([Icon, label], i) => { const ItemIcon = Icon as LucideIcon; return <div key={String(label)} className="journey-arrive rounded-2xl border border-border bg-background/70 px-2 py-4 text-center" style={{ animationDelay: `${120 + i * 120}ms` }}><ItemIcon className="mx-auto size-6 text-brand" /><p className="mt-2 text-sm font-medium">{String(label)}</p></div>; })}</div>{automation && <p className="text-sm text-muted-foreground">{String(answers["a.output"] ?? "Un résultat concret")} · {String(answers["a.control"] ?? "Validation humaine")}</p>}</div>;
}
