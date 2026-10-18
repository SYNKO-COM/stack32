"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Brain, Check, FileText, Layers, Loader2, Search, ShieldCheck, Sparkles, Workflow, ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/hooks/use-translation";
import { previewProgress, suggestPreviewTool } from "@/lib/agent-preview";
import { cn } from "@/lib/utils";

type Props = {
  idea: string; audience: string; outcome: string; startedAt: number;
  name: string; onNameChange: (name: string) => void;
  busy: boolean; error: boolean; onContinue: () => void; onBack: () => void;
};
const positions = [{ x: 22, y: 22 }, { x: 78, y: 22 }, { x: 84, y: 62 }, { x: 50, y: 85 }, { x: 16, y: 62 }];

export function AgentPreview(props: Props) {
  const { t } = useTranslation("onboarding");
  const reduced = useReducedMotion();
  const [progress, setProgress] = useState(() => previewProgress(props.startedAt, Date.now()));
  const [skipped, setSkipped] = useState(false);
  const ready = skipped || progress >= 1;
  const stage = ready ? 5 : Math.floor(progress * 5);
  const tool = suggestPreviewTool(props.idea);
  const labels = [t("preview.nodes.brief"), t("preview.nodes.instructions"), t(`preview.tools.${tool}`), t("preview.nodes.output"), t("preview.nodes.review")];
  const icons = [FileText, ShieldCheck, tool === "research" ? Search : Layers, Workflow, Check];

  useEffect(() => {
    if (ready) return;
    const timer = setInterval(() => setProgress(previewProgress(props.startedAt, Date.now())), 250);
    return () => clearInterval(timer);
  }, [props.startedAt, ready]);

  return <div className="mx-auto w-full max-w-2xl pb-8" data-testid="agent-preview">
    <div className="text-center">
      <span className="inline-flex items-center gap-2 rounded-full border border-brand/25 bg-brand/10 px-3 py-1.5 text-xs font-medium text-brand"><Sparkles className="size-3.5" />{t("preview.badge")}</span>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight sm:text-4xl">{t(ready ? "preview.readyTitle" : "preview.title")}</h1>
      <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground">{t(ready ? "preview.readySubtitle" : "preview.subtitle")}</p>
    </div>

    <div className="relative mx-auto mt-6 aspect-square w-full max-w-[440px] overflow-hidden rounded-[32px] border border-brand/20 bg-gradient-to-br from-brand/10 via-background to-amber-500/5 shadow-[0_24px_70px_-45px_#ff9800]" aria-label={t("preview.diagramLabel")}>
      <div className="absolute inset-7 rounded-full border border-brand/10" />
      <div className="absolute inset-[22%] rounded-full border border-dashed border-brand/20" />
      <svg viewBox="0 0 100 100" className="absolute inset-0 size-full text-brand" aria-hidden="true">
        {positions.map((point, index) => <g key={index}>
          <path d={`M 50 47 Q 50 ${point.y} ${point.x} ${point.y}`} fill="none" stroke="currentColor" strokeWidth="0.35" opacity={stage >= index ? 0.55 : 0.12} />
          {stage >= index && !reduced && <motion.path d={`M 50 47 Q 50 ${point.y} ${point.x} ${point.y}`} fill="none" stroke="currentColor" strokeWidth="0.7" strokeDasharray="2 14" animate={{ strokeDashoffset: [32, 0] }} transition={{ duration: 4, repeat: Infinity, ease: "linear" }} />}
        </g>)}
      </svg>
      <motion.div className="absolute left-1/2 top-[47%] -translate-x-1/2 -translate-y-1/2" animate={reduced || ready ? undefined : { scale: [1, 1.06, 1] }} transition={{ duration: 3, repeat: Infinity }}>
        <div className="flex size-20 items-center justify-center rounded-3xl border border-white/40 bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-[0_10px_35px_-10px_#ff9800] sm:size-24"><Brain className="size-10 sm:size-12" strokeWidth={1.4} /></div>
      </motion.div>
      {positions.map((point, index) => {
        const Icon = icons[index];
        return <motion.div key={index} className="absolute w-[29%] -translate-x-1/2 -translate-y-1/2 text-center" style={{ left: `${point.x}%`, top: `${point.y}%` }} animate={{ opacity: stage >= index ? 1 : 0.3, y: stage >= index ? 0 : 6 }} transition={{ duration: reduced ? 0 : 0.6 }}>
          <div className={cn("mx-auto flex size-10 items-center justify-center rounded-2xl border bg-background shadow-sm sm:size-12", stage >= index ? "border-brand/40 text-brand" : "border-border text-muted-foreground")}><Icon className="size-5" /></div>
          <p className="mx-auto mt-2 max-w-24 text-[11px] font-medium leading-tight sm:text-xs">{labels[index]}</p>
        </motion.div>;
      })}
    </div>

    {!ready ? <div className="mx-auto mt-6 max-w-md">
      <div className="mb-3 flex items-center justify-between gap-3 text-sm" aria-live="polite"><span>{t(`preview.stages.${stage}`)}</span><span className="font-mono text-brand">{Math.floor(progress * 100)}%</span></div>
      <div role="progressbar" aria-label={t("preview.title")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.floor(progress * 100)} className="h-1.5 overflow-hidden rounded-full bg-brand/10"><div className="h-full rounded-full bg-brand transition-[width] duration-300" style={{ width: `${progress * 100}%` }} /></div>
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{t("preview.localNotice")}</p>
      <Button variant="ghost" className="mt-3 min-h-11 w-full text-sm" onClick={() => setSkipped(true)}>{t("preview.skip")}</Button>
    </div> : <div className="mt-6 space-y-5">
      <div className="rounded-2xl border border-border/70 bg-background/70 p-4 text-sm">
        <p className="break-words font-medium">{props.idea}</p>
        <p className="mt-2 break-words text-muted-foreground">{props.audience} · {props.outcome}</p>
      </div>
      <div><Label htmlFor="preview-agent-name">{t("preview.nameLabel")}</Label><Input id="preview-agent-name" value={props.name} onChange={(e) => props.onNameChange(e.target.value)} maxLength={80} className="mt-2 min-h-12" /></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Button className="min-h-12 rounded-full" disabled={props.busy || !props.name.trim()} onClick={props.onContinue}>{props.busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}{t("preview.use")}</Button>
        <Button variant="outline" className="min-h-12 rounded-full" disabled={props.busy || !props.name.trim()} onClick={props.onContinue}>{t("preview.monetize")}</Button>
      </div>
      <p className="text-center text-xs leading-relaxed text-muted-foreground">{t("preview.paymentNotice")}</p>
      {props.error && <p role="alert" className="text-sm text-destructive">{t("journey.error")}</p>}
    </div>}
    <Button variant="ghost" className="mt-5 min-h-11" disabled={props.busy} onClick={props.onBack}>{t("preview.edit")}</Button>
  </div>;
}
