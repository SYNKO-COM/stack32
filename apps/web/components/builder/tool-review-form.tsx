"use client";

import { Loader2, Plus, Trash2, Wrench } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { AppSearchField } from "@/components/builder/app-search-field";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useTranslation } from "@/hooks/use-translation";
import { submitBuilderToolReview } from "@/lib/actions/builder";
import type { BuilderToolReviewEntry, BuilderUiComponent } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

type DraftTool = BuilderToolReviewEntry & { key: string };

function seedFromComponent(ui: BuilderUiComponent): DraftTool[] {
  return (ui.tools ?? []).map((tool, index) => ({
    ...tool,
    key: `${tool.toolId}-${index}`,
  }));
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
  const [tools, setTools] = useState<DraftTool[]>(() => seedFromComponent(uiComponent));
  const [addAppId, setAddAppId] = useState("");
  const [addUtility, setAddUtility] = useState("");
  const [adding, setAdding] = useState(false);

  const mode = uiComponent.mode === "modify" ? "modify" : "initial";
  const visible = useMemo(
    () => tools.filter((tool) => tool.change !== "remove"),
    [tools],
  );
  const proposedRemovals = useMemo(
    () => tools.filter((tool) => tool.change === "remove"),
    [tools],
  );

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
    const name = appId
      .replace(/_/g, " ")
      .replace(/-/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
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
      },
    ]);
    setAddAppId("");
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

        <ul className="space-y-2.5">
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
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand/15 text-brand">
                  <Wrench className="size-3.5" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{tool.name}</p>
                      <p className="truncate font-mono text-[11px] text-muted-foreground">
                        {tool.appId || tool.toolId}
                      </p>
                    </div>
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
                      rows={2}
                      disabled={pending}
                      placeholder={t("toolReview.utilityPlaceholder")}
                      className="min-h-[58px] resize-none text-sm"
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
            <ul className="space-y-2">
              {proposedRemovals.map((tool) => (
                <li
                  key={tool.key}
                  className="flex items-center justify-between gap-3 rounded-xl border border-rose-500/25 bg-rose-500/[0.06] px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{tool.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{tool.utility}</p>
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
              value={addAppId}
              onChange={setAddAppId}
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
