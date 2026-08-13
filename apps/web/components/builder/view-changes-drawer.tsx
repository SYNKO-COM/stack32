"use client";

import { FileCode2, X } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { useTranslation } from "@/hooks/use-translation";
import {
  getAgentProjectStructureAction,
  getSnapshotFileAction,
  listAgentProjectFiles,
} from "@/lib/actions/agents";

const FRIENDLY: Record<string, string> = {
  "agent.json": "Agent settings",
  "graph.json": "How the agent thinks (steps)",
  "tools.json": "Tools the agent can use",
  "agent.yaml": "Agent manifest",
  "src/agent/orchestrator.py": "Orchestrator code",
  "src/agent/tools.py": "Tool code",
  "src/agent/prompts.py": "Instructions",
  "tests/test_agent.py": "Automated tests",
};

export function ViewChangesDrawer({
  agentId,
  open,
  onClose,
}: {
  agentId: string;
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation("builder");
  const [files, setFiles] = useState<Array<{ path: string; checksum?: string }>>([]);
  const [snapshotId, setSnapshotId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<{ path: string; content: string } | null>(null);
  const [loadingFile, setLoadingFile] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- enter loading state when the drawer opens
    setLoading(true);
    setSelected(null);
    void (async () => {
      try {
        const structure = await getAgentProjectStructureAction(agentId);
        if (cancelled) return;
        if (structure.structure?.nodes?.length && structure.snapshotId) {
          setSnapshotId(structure.snapshotId);
          setFiles(
            structure.structure.nodes
              .filter((n) => n.file && !n.id.startsWith("tool:"))
              .map((n) => ({ path: n.file })),
          );
        } else {
          const rows = await listAgentProjectFiles(agentId);
          if (!cancelled) {
            setSnapshotId(null);
            setFiles(rows);
          }
        }
      } catch {
        if (!cancelled) setFiles([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, agentId]);

  const openFile = async (path: string) => {
    if (!snapshotId) return;
    setLoadingFile(true);
    try {
      const file = await getSnapshotFileAction(agentId, snapshotId, path);
      setSelected(file ? { path: file.path, content: file.content } : null);
    } catch {
      setSelected(null);
    } finally {
      setLoadingFile(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" role="dialog">
      <div className="flex h-full w-full max-w-lg flex-col border-l border-border bg-background p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-medium">
            {t("project.viewChanges", { defaultValue: "What changed" })}
          </h2>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          {t("project.viewChangesHint", {
            defaultValue:
              "These are the files that make up your agent. Tap one to peek at the content.",
          })}
        </p>
        {loading ? (
          <p className="text-sm text-muted-foreground">…</p>
        ) : files.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("project.empty", { defaultValue: "No project files yet." })}
          </p>
        ) : (
          <ul className="space-y-2 overflow-auto">
            {files.map((f) => (
              <li key={f.path}>
                <button
                  type="button"
                  className="flex w-full items-start gap-3 rounded-xl border border-border px-3 py-2.5 text-left hover:bg-foreground/5"
                  onClick={() => void openFile(f.path)}
                  disabled={!snapshotId}
                >
                  <FileCode2 className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">
                      {t(`project.files.${f.path}`, {
                        defaultValue: FRIENDLY[f.path] ?? f.path,
                      })}
                    </span>
                    <span className="mt-0.5 block truncate font-mono text-[11px] text-muted-foreground">
                      {f.path}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {loadingFile ? (
          <p className="mt-4 text-sm text-muted-foreground">…</p>
        ) : selected ? (
          <pre className="mt-4 max-h-[40vh] overflow-auto rounded-2xl border border-border/60 bg-foreground/[0.03] p-3 font-mono text-[11px] leading-relaxed text-foreground/85">
            {selected.content.slice(0, 12_000)}
          </pre>
        ) : null}
      </div>
    </div>
  );
}
