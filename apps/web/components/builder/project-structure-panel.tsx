"use client";

import {
  Code2,
  FileCode2,
  FileText,
  Link2,
  Loader2,
  Shield,
  Wrench,
} from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useTranslation } from "@/hooks/use-translation";
import type { ProjectStructure, ProjectStructureNode } from "@/lib/actions/agents";
import { cn } from "@/lib/utils";

const TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  manifest: FileText,
  entrypoint: FileCode2,
  orchestrator: Code2,
  prompts: FileText,
  security: Shield,
  tool_registry: Wrench,
  tool: Wrench,
  memory: FileCode2,
  tests: FileCode2,
};

interface ProjectStructurePanelProps {
  agentId: string;
  structure: ProjectStructure;
  snapshotId: string;
}

export function ProjectStructurePanel({
  agentId,
  structure,
  snapshotId,
}: ProjectStructurePanelProps) {
  const { t } = useTranslation("structure");
  const { t: tBuilder } = useTranslation("builder");
  const [selected, setSelected] = useState<ProjectStructureNode | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [loadingCode, setLoadingCode] = useState(false);
  const [codeError, setCodeError] = useState(false);

  const topLevel = useMemo(
    () => structure.nodes.filter((n) => !n.id.startsWith("tool:")),
    [structure.nodes],
  );
  const tools = useMemo(
    () => structure.nodes.filter((n) => n.id.startsWith("tool:")),
    [structure.nodes],
  );

  const openNode = (node: ProjectStructureNode) => {
    setSelected(node);
    setSheetOpen(true);
    setCode(null);
    setCodeError(false);
  };

  const loadCode = async () => {
    if (!selected) return;
    setLoadingCode(true);
    setCodeError(false);
    try {
      const { getSnapshotFileAction } = await import("@/lib/actions/agents");
      const file = await getSnapshotFileAction(agentId, snapshotId, selected.file);
      if (!file?.content) {
        setCodeError(true);
        setCode(null);
      } else {
        setCode(file.content);
      }
    } catch {
      setCodeError(true);
      setCode(null);
    } finally {
      setLoadingCode(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="mb-1">
        <h2 className="text-sm font-medium">{tBuilder("structurePanel.title")}</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {tBuilder("structurePanel.subtitle")}
        </p>
        {structure.pattern ? (
          <p className="mt-1.5 font-mono text-[11px] text-muted-foreground">
            {structure.pattern}
            {structure.runtime_version ? ` · runtime ${structure.runtime_version}` : ""}
          </p>
        ) : null}
      </div>

      <ul className="grid gap-2 sm:grid-cols-2">
        {topLevel.map((node) => {
          const Icon = TYPE_ICONS[node.type] ?? FileCode2;
          return (
            <li key={node.id}>
              <button
                type="button"
                className={cn(
                  "glass flex w-full items-center gap-3 rounded-2xl border border-border/50 px-3.5 py-3 text-left",
                  "transition-colors hover:border-brand/40 hover:bg-brand/5",
                  selected?.id === node.id && sheetOpen && "border-brand/50 ring-1 ring-brand/25",
                )}
                onClick={() => openNode(node)}
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-brand/12 text-brand">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{node.label}</span>
                  <span className="block truncate font-mono text-[10px] text-muted-foreground">
                    {node.file}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {tools.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {tBuilder("structurePanel.nodeTypes.tool")}
          </h3>
          <ul className="space-y-1.5">
            {tools.map((node) => (
              <li key={node.id}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm hover:bg-foreground/5"
                  onClick={() => openNode(node)}
                >
                  <span className="font-mono text-foreground/85">{node.label}</span>
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    {node.config?.side_effect ? (
                      <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-amber-300">
                        {tBuilder("structurePanel.sideEffect")}
                      </span>
                    ) : null}
                    {node.binding?.provider ? (
                      <span className="inline-flex items-center gap-1">
                        <Link2 className="size-3" aria-hidden="true" />
                        {tBuilder("structurePanel.boundTo", {
                          provider: node.binding.provider,
                        })}
                      </span>
                    ) : (
                      <span>{tBuilder("structurePanel.notBound")}</span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="glass flex w-full flex-col sm:max-w-lg">
          {selected ? (
            <>
              <SheetHeader>
                <SheetTitle>{selected.label}</SheetTitle>
                <SheetDescription>
                  {tBuilder(`structurePanel.nodeTypes.${selected.type}`, {
                    defaultValue: selected.type,
                  })}
                </SheetDescription>
              </SheetHeader>
              <div className="mt-4 space-y-4 overflow-y-auto px-1 pb-6">
                <p className="font-mono text-xs text-muted-foreground">{selected.file}</p>
                {selected.binding?.provider ? (
                  <p className="text-sm text-muted-foreground">
                    {tBuilder("structurePanel.boundTo", {
                      provider: selected.binding.provider,
                    })}
                  </p>
                ) : null}
                {selected.config && Object.keys(selected.config).length > 0 ? (
                  <pre className="overflow-x-auto rounded-xl bg-foreground/5 p-3 font-mono text-[11px] text-foreground/80">
                    {JSON.stringify(selected.config, null, 2)}
                  </pre>
                ) : null}
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="rounded-full"
                    onClick={() => void loadCode()}
                    disabled={loadingCode}
                  >
                    {loadingCode ? (
                      <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <Code2 className="size-3.5" aria-hidden="true" />
                    )}
                    {tBuilder("structurePanel.viewCode")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="rounded-full"
                    onClick={() => void loadCode()}
                    disabled={loadingCode}
                  >
                    {tBuilder("structurePanel.openFile")}
                  </Button>
                </div>
                {codeError ? (
                  <p className="text-sm text-destructive">{t("project.fileMissing")}</p>
                ) : null}
                {code ? (
                  <pre className="max-h-[50vh] overflow-auto rounded-2xl border border-border/50 bg-background/60 p-4 font-mono text-[11px] leading-relaxed text-foreground/85">
                    {code}
                  </pre>
                ) : null}
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
