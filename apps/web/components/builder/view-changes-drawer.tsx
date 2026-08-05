"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useTranslation } from "@/hooks/use-translation";
import { listAgentProjectFiles } from "@/lib/actions/agents";

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
  const [files, setFiles] = useState<Array<{ path: string; checksum?: string; updated_at?: string }>>(
    [],
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    void listAgentProjectFiles(agentId)
      .then((rows) => {
        if (!cancelled) setFiles(rows);
      })
      .catch(() => {
        if (!cancelled) setFiles([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, agentId]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" role="dialog">
      <div className="flex h-full w-full max-w-md flex-col border-l border-border bg-background p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-medium">
            {t("project.viewChanges", { defaultValue: "View changes" })}
          </h2>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          {t("project.viewChangesHint", {
            defaultValue: "Project files generated from the latest validated agent spec.",
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
              <li key={f.path} className="rounded-md border border-border px-3 py-2 text-sm">
                <div className="font-mono">{f.path}</div>
                {f.checksum ? (
                  <div className="mt-1 truncate text-xs text-muted-foreground">{f.checksum}</div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
