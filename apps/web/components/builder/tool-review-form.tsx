"use client";

import { Loader2, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { AppSearchField } from "@/components/builder/app-search-field";
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

type DraftTool = BuilderToolReviewEntry & { key: string };

function looksLikeEnglishDefault(utility: string): boolean {
  return /lets the agent use/i.test(utility) || /toward:/i.test(utility);
}

function seedFromComponent(
  ui: BuilderUiComponent,
  localize: (name: string) => string,
): DraftTool[] {
  const grouped = new Map<string, DraftTool>();
  for (const [index, tool] of (ui.tools ?? []).entries()) {
    if (!isProductFacingTool(tool.toolId)) continue;
    const appKey = resolveAppKey(tool.toolId, {
      appId: tool.appId,
      provider: tool.provider,
    });
    const name = resolveAppDisplayName(appKey, tool.toolId) || tool.name;
    const utility = looksLikeEnglishDefault(tool.utility) ? localize(name) : tool.utility;
    const incomingIds = tool.toolIds?.length ? tool.toolIds : [tool.toolId];
    const existing = grouped.get(appKey);
    if (existing) {
      const merged = new Set([...(existing.toolIds ?? [existing.toolId]), ...incomingIds]);
      existing.toolIds = [...merged];
      if (tool.change === "add") existing.change = "add";
      continue;
    }
    grouped.set(appKey, {
      ...tool,
      key: `${appKey}-${index}`,
      name,
      appId: tool.appId || appKey,
      provider: tool.provider || "pipedream",
      utility,
      toolIds: incomingIds,
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
      // Pipedream hosts logos off-origin.
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

export function ToolReviewForm({
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
  const [tools, setTools] = useState<DraftTool[]>(() =>
    seedFromComponent(uiComponent, (name) => t("toolReview.utilityDefault", { name })),
  );
  const [addAppId, setAddAppId] = useState("");
  const [addAppName, setAddAppName] = useState("");
  const [addUtility, setAddUtility] = useState("");
  const [adding, setAdding] = useState(false);
  const [iconsVersion, setIconsVersion] = useState(0);

  const mode = uiComponent.mode === "modify" ? "modify" : "initial";
  const visible = useMemo(
    () => tools.filter((tool) => tool.change !== "remove"),
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

  const removeTool = (key: string) => {
    setTools((prev) => prev.filter((tool) => tool.key !== key));
  };

  const keepRemoval = (key: string) => {
    setTools((prev) =>
      prev.map((tool) =>
        tool.key === key ? { ...tool, change: "keep" as const } : tool,
      ),
    );
  };

  const updateUtility = (key: string, utility: string) => {
    setTools((prev) =>
      prev.map((tool) => (tool.key === key ? { ...tool, utility } : tool)),
    );
  };

  const addFromSearch = () => {
    const appId = addAppId.trim();
    if (!appId) {
      setError(t("toolReview.addRequired"));
      return;
    }
    if (!addUtility.trim()) {
      setError(t("toolReview.utilityRequired"));
      return;
    }
    if (tools.some((tool) => tool.appId === appId || tool.toolId === `app:${appId}`)) {
      setError(t("toolReview.alreadyAdded"));
      return;
    }
    setAdding(false);
    setError(null);
    const name =
      addAppName.trim() ||
      resolveAppDisplayName(appId) ||
      appId.replace(/[_-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    setTools((prev) => [
      ...prev,
      {
        key: `app:${appId}-${Date.now()}`,
        toolId: `app:${appId}`,
        name,
        provider: "pipedream",
        appId,
        utility: addUtility.trim(),
        change: "add",
        removable: true,
        toolIds: [`app:${appId}`],
      },
    ]);
    setAddAppId("");
    setAddAppName("");
    setAddUtility("");
  };

  const submit = () => {
    setError(null);
    const finalTools = tools.filter((tool) => tool.change !== "remove");
    for (const tool of finalTools) {
      if (!tool.utility.trim()) {
        setError(t("toolReview.utilityRequired"));
        return;
      }
    }
    startTransition(async () => {
      try {
        onSubmitted?.();
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
        <p className="text-sm font-medium text-foreground">
          {mode === "modify" ? t("toolReview.titleModify") : t("toolReview.title")}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {mode === "modify" ? t("toolReview.hintModify") : t("toolReview.hint")}
        </p>
      </div>

      <div className="space-y-3 p-4">
        {visible.length === 0 && proposedRemovals.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border/70 px-3 py-6 text-center text-sm text-muted-foreground">
            {t("toolReview.empty")}
          </p>
        ) : null}

        <ul className="grid grid-cols-1 gap-3">
          {visible.map((tool) => (
            <li
              key={tool.key}
              className={cn(
                "rounded-xl border px-3 py-3",
                tool.change === "add"
                  ? "border-emerald-500/25 bg-emerald-500/[0.06]"
                  : "border-border/70 bg-card/40",
              )}
            >
              <div className="flex items-start gap-3">
                <span
                  className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-background shadow-sm ring-1 ring-border/60"
                  data-icons={iconsVersion}
                >
                  <AppLogo appId={tool.appId} name={tool.name} />
                </span>
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate text-sm font-medium text-foreground">{tool.name}</p>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {tool.change === "add" ? (
                        <span className="rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                          {t("toolReview.badgeAdd")}
                        </span>
                      ) : null}
                      {tool.removable !== false ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="text-muted-foreground hover:text-destructive"
                          aria-label={t("toolReview.remove")}
                          onClick={() => removeTool(tool.key)}
                          disabled={pending}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      ) : null}
                    </div>
                  </div>
                  <label className="block space-y-1">
                    <span className="text-[11px] font-medium text-muted-foreground">
                      {t("toolReview.utilityLabel")}
                    </span>
                    <Textarea
                      value={tool.utility}
                      onChange={(e) => updateUtility(tool.key, e.target.value)}
                      rows={3}
                      disabled={pending}
                      placeholder={t("toolReview.utilityPlaceholder")}
                      className="min-h-[72px] resize-none text-sm"
                    />
                  </label>
                </div>
              </div>
            </li>
          ))}
        </ul>

        {proposedRemovals.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              {t("toolReview.proposedRemovals")}
            </p>
            <ul className="grid grid-cols-1 gap-2">
              {proposedRemovals.map((tool) => (
                <li
                  key={tool.key}
                  className="flex items-center justify-between gap-3 rounded-xl border border-rose-500/25 bg-rose-500/[0.06] px-3 py-2.5"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-background ring-1 ring-border/60">
                      <AppLogo appId={tool.appId} name={tool.name} />
                    </span>
                    <p className="truncate text-sm font-medium text-foreground">{tool.name}</p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={() => keepRemoval(tool.key)}
                    disabled={pending}
                  >
                    {t("toolReview.keep")}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {adding ? (
          <div className="space-y-2.5 rounded-xl border border-border/70 bg-foreground/[0.02] p-3">
            <AppSearchField
              value={addAppName || addAppId}
              onChange={() => {
                setAddAppId("");
                setAddAppName("");
              }}
              onSelect={(app) => {
                setAddAppId(app.appId);
                setAddAppName(app.name);
                if (app.imgSrc) cacheIntegrationIcon(app.appId, app.imgSrc);
              }}
              placeholder={t("toolReview.searchPlaceholder")}
            />
            <Textarea
              value={addUtility}
              onChange={(e) => setAddUtility(e.target.value)}
              rows={2}
              placeholder={t("toolReview.utilityPlaceholder")}
              className="min-h-[58px] resize-none text-sm"
            />
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setAdding(false);
                  setAddAppId("");
                  setAddAppName("");
                  setAddUtility("");
                }}
              >
                {t("toolReview.cancelAdd")}
              </Button>
              <Button type="button" size="sm" onClick={addFromSearch}>
                {t("toolReview.confirmAdd")}
              </Button>
            </div>
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => setAdding(true)}
            disabled={pending}
          >
            <Plus className="size-3.5" aria-hidden="true" />
            {t("toolReview.addTool")}
          </Button>
        )}

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <div className="flex justify-end pt-1">
          <Button type="button" onClick={submit} disabled={pending} className="min-w-[9rem] gap-1.5">
            {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : null}
            {pending ? t("toolReview.submitting") : t("toolReview.continue")}
          </Button>
        </div>
      </div>
    </div>
  );
}
