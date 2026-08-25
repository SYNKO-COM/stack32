"use client";

import { Check, Loader2, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useTranslation } from "@/hooks/use-translation";
import { submitBuilderToolReview } from "@/lib/actions/builder";
import { lookupIntegrationAppIcons } from "@/lib/actions/integrations";
import type { BuilderToolReviewEntry, BuilderUiComponent } from "@/lib/domain/types";
import {
  isProductFacingTool,
  resolveAppDisplayName,
  resolveAppKey,
} from "@/lib/integrations/app-grouping";
import {
  cacheIntegrationIcon,
  getCachedIntegrationIcon,
} from "@/lib/integrations/icon-resolver";
import { cn } from "@/lib/utils";

type DraftTool = BuilderToolReviewEntry & {
  key: string;
  /** User decision for proposed adds/removes. */
  decision?: "pending" | "accept" | "reject";
};

function seedFromComponent(ui: BuilderUiComponent): DraftTool[] {
  const grouped = new Map<string, DraftTool>();
  for (const [index, tool] of (ui.tools ?? []).entries()) {
    if (!isProductFacingTool(tool.toolId)) continue;
    const appKey = resolveAppKey(tool.toolId, {
      appId: tool.appId,
      provider: tool.provider,
    });
    const name = resolveAppDisplayName(appKey, tool.toolId) || tool.name;
    const incomingIds = tool.toolIds?.length ? tool.toolIds : [tool.toolId];
    const existing = grouped.get(appKey);
    if (existing) {
      const merged = new Set([...(existing.toolIds ?? [existing.toolId]), ...incomingIds]);
      existing.toolIds = [...merged];
      if (tool.change === "add") existing.change = "add";
      if (tool.change === "remove") existing.change = "remove";
      continue;
    }
    grouped.set(appKey, {
      ...tool,
      key: `${appKey}-${index}`,
      name,
      appId: tool.appId || appKey,
      provider: tool.provider || "pipedream",
      utility: tool.utility,
      toolIds: incomingIds,
      decision: tool.change === "keep" ? "accept" : "pending",
    });
  }
  return [...grouped.values()];
}

function AppLogo({ appId, name }: { appId?: string; name: string }) {
  const src = appId ? getCachedIntegrationIcon(appId) : undefined;
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
  }, [src, appId]);
  if (src && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        width={28}
        height={28}
        className="size-7 object-contain"
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <span className="text-[11px] font-semibold uppercase tracking-wide text-brand">
      {name.slice(0, 2)}
    </span>
  );
}

function ToolCard({
  tool,
  iconsVersion,
  pending,
  onUtilityChange,
  onRemove,
  onDecision,
  showDecision,
  decisionLabels,
}: {
  tool: DraftTool;
  iconsVersion: number;
  pending: boolean;
  onUtilityChange?: (utility: string) => void;
  onRemove?: () => void;
  onDecision?: (decision: "accept" | "reject") => void;
  showDecision?: boolean;
  decisionLabels: { accept: string; reject: string };
}) {
  const { t } = useTranslation("builder");
  const borderClass =
    tool.change === "add"
      ? "border-emerald-500/25 bg-emerald-500/[0.06]"
      : tool.change === "remove"
        ? "border-rose-500/25 bg-rose-500/[0.06]"
        : "border-border/70 bg-card/40";

  return (
    <li className={cn("rounded-xl border px-3 py-3", borderClass)}>
      <div className="flex items-start gap-3">
        <span
          className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-background shadow-sm ring-1 ring-border/60"
          data-icons={iconsVersion}
        >
          <AppLogo appId={tool.appId} name={tool.name} />
        </span>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{tool.name}</p>
              {tool.change === "add" ? (
                <p className="mt-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                  {t("toolChangeReview.badgeAdd")}
                </p>
              ) : null}
              {tool.change === "remove" ? (
                <p className="mt-0.5 text-[11px] font-medium text-rose-700 dark:text-rose-300">
                  {t("toolChangeReview.badgeRemove")}
                </p>
              ) : null}
            </div>
            {onRemove ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground hover:text-destructive"
                aria-label={t("toolChangeReview.removeCurrent")}
                onClick={onRemove}
                disabled={pending}
              >
                <Trash2 className="size-3.5" />
              </Button>
            ) : null}
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">{tool.utility}</p>
          {onUtilityChange ? (
            <Textarea
              value={tool.utility}
              onChange={(e) => onUtilityChange(e.target.value)}
              rows={2}
              disabled={pending}
              placeholder={t("toolReview.utilityPlaceholder")}
              className="min-h-[58px] resize-none text-sm"
            />
          ) : null}
          {showDecision && onDecision ? (
            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                type="button"
                size="sm"
                variant={tool.decision === "accept" ? "default" : "outline"}
                className="gap-1"
                onClick={() => onDecision("accept")}
                disabled={pending}
              >
                <Check className="size-3.5" aria-hidden="true" />
                {decisionLabels.accept}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={tool.decision === "reject" ? "destructive" : "outline"}
                className="gap-1"
                onClick={() => onDecision("reject")}
                disabled={pending}
              >
                <X className="size-3.5" aria-hidden="true" />
                {decisionLabels.reject}
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </li>
  );
}

export function ToolChangeReviewForm({
  uiComponent,
  runId,
  onSubmitted,
}: {
  uiComponent: BuilderUiComponent;
  runId: string;
  onSubmitted?: () => void;
}) {
  const { t } = useTranslation("builder");
  const queryClient = useQueryClient();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [tools, setTools] = useState<DraftTool[]>(() => seedFromComponent(uiComponent));
  const [iconsVersion, setIconsVersion] = useState(0);

  const currentTools = useMemo(
    () => tools.filter((tool) => tool.change === "keep"),
    [tools],
  );
  const proposedAdds = useMemo(
    () => tools.filter((tool) => tool.change === "add"),
    [tools],
  );
  const proposedRemovals = useMemo(
    () => tools.filter((tool) => tool.change === "remove"),
    [tools],
  );
  const appKeys = useMemo(
    () => [...new Set(tools.map((tool) => tool.appId).filter(Boolean))] as string[],
    [tools],
  );

  useEffect(() => {
    if (appKeys.length === 0) return;
    let cancelled = false;
    void lookupIntegrationAppIcons(appKeys).then((icons) => {
      if (cancelled) return;
      for (const [key, src] of Object.entries(icons)) {
        cacheIntegrationIcon(key, src);
      }
      if (Object.keys(icons).length > 0) setIconsVersion((n) => n + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [appKeys]);

  // Every proposed add/removal needs an explicit answer: the button stays
  // closed until then, rather than failing after the click.
  const undecidedCount = [...proposedAdds, ...proposedRemovals].filter(
    (tool) => tool.decision === "pending",
  ).length;

  const setDecision = (key: string, decision: "accept" | "reject") => {
    setTools((prev) =>
      prev.map((tool) => (tool.key === key ? { ...tool, decision } : tool)),
    );
  };

  const removeCurrent = (key: string) => {
    setTools((prev) => prev.filter((tool) => tool.key !== key));
  };

  const updateUtility = (key: string, utility: string) => {
    setTools((prev) =>
      prev.map((tool) => (tool.key === key ? { ...tool, utility } : tool)),
    );
  };

  const submit = () => {
    setError(null);
    const pendingProposals = [...proposedAdds, ...proposedRemovals].filter(
      (tool) => tool.decision === "pending",
    );
    if (pendingProposals.length > 0) {
      setError(t("toolChangeReview.decisionRequired"));
      return;
    }

    const finalTools: DraftTool[] = [
      ...currentTools,
      ...proposedAdds.filter((tool) => tool.decision === "accept"),
    ];

    for (const tool of finalTools) {
      if (!tool.utility.trim()) {
        setError(t("toolReview.utilityRequired"));
        return;
      }
    }

    startTransition(async () => {
      try {
        await submitBuilderToolReview({
          runId,
          tools: finalTools.map((tool) => ({
            toolId: tool.toolId,
            provider: tool.provider,
            appId: tool.appId,
            externalActionId: tool.externalActionId,
            utility: tool.utility.trim(),
            toolIds: tool.toolIds,
          })),
        });
        onSubmitted?.();
        void queryClient.invalidateQueries({ queryKey: ["builder"] });
        void queryClient.invalidateQueries({ queryKey: ["agents"] });
      } catch {
        setError(t("toolReview.error"));
      }
    });
  };

  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-border/70 bg-background/80 shadow-sm">
      <div className="border-b border-border/60 bg-foreground/[0.03] px-4 py-3">
        <p className="text-sm font-medium text-foreground">{t("toolChangeReview.title")}</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {t("toolChangeReview.hint")}
        </p>
      </div>

      <div className="space-y-4 p-4">
        {currentTools.length > 0 ? (
          <section className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("toolChangeReview.currentTools")}
            </p>
            <ul className="grid grid-cols-1 gap-3">
              {currentTools.map((tool) => (
                <ToolCard
                  key={tool.key}
                  tool={tool}
                  iconsVersion={iconsVersion}
                  pending={pending}
                  onRemove={() => removeCurrent(tool.key)}
                  decisionLabels={{
                    accept: t("toolChangeReview.authorize"),
                    reject: t("toolChangeReview.refuse"),
                  }}
                />
              ))}
            </ul>
          </section>
        ) : null}

        {proposedAdds.length > 0 ? (
          <section className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
              {t("toolChangeReview.proposedAdds")}
            </p>
            <ul className="grid grid-cols-1 gap-3">
              {proposedAdds.map((tool) => (
                <ToolCard
                  key={tool.key}
                  tool={tool}
                  iconsVersion={iconsVersion}
                  pending={pending}
                  showDecision
                  onDecision={(decision) => setDecision(tool.key, decision)}
                  onUtilityChange={(utility) => updateUtility(tool.key, utility)}
                  decisionLabels={{
                    accept: t("toolChangeReview.authorizeAdd"),
                    reject: t("toolChangeReview.refuseAdd"),
                  }}
                />
              ))}
            </ul>
          </section>
        ) : null}

        {proposedRemovals.length > 0 ? (
          <section className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-rose-700 dark:text-rose-300">
              {t("toolChangeReview.proposedRemovals")}
            </p>
            <ul className="grid grid-cols-1 gap-3">
              {proposedRemovals.map((tool) => (
                <ToolCard
                  key={tool.key}
                  tool={tool}
                  iconsVersion={iconsVersion}
                  pending={pending}
                  showDecision
                  onDecision={(decision) => setDecision(tool.key, decision)}
                  decisionLabels={{
                    accept: t("toolChangeReview.authorizeRemove"),
                    reject: t("toolChangeReview.refuseRemove"),
                  }}
                />
              ))}
            </ul>
          </section>
        ) : null}

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
          {undecidedCount > 0 ? (
            <p className="mr-auto text-xs text-muted-foreground">
              {t("toolChangeReview.decisionsRemaining", { count: undecidedCount })}
            </p>
          ) : null}
          <Button
            type="button"
            onClick={submit}
            disabled={pending || undecidedCount > 0}
            className="min-w-[9rem] gap-1.5"
          >
            {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : null}
            {pending ? t("toolChangeReview.submitting") : t("toolChangeReview.continue")}
          </Button>
        </div>
      </div>
    </div>
  );
}
