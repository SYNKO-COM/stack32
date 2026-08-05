"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { useTranslation } from "@/hooks/use-translation";
import { startGoogleConnection } from "@/lib/actions/connections";

export function ConnectGoogleCard({
  agentId,
  bindings,
}: {
  agentId: string;
  bindings?: Array<{ connection_id: string; tool_ids: string[]; enabled: boolean }>;
}) {
  const { t } = useTranslation("builder");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const connected = (bindings ?? []).some((b) => b.enabled);

  return (
    <div className="rounded-xl border border-border p-4 space-y-3">
      <div>
        <h3 className="text-sm font-medium">
          {t("connections.googleTitle", { defaultValue: "Google" })}
        </h3>
        <p className="text-xs text-muted-foreground">
          {t("connections.googleHint", {
            defaultValue: "Connect Gmail and Calendar. Tokens never leave the vault.",
          })}
        </p>
      </div>
      {connected ? (
        <p className="text-sm text-emerald-600">
          {t("connections.connected", { defaultValue: "Connected" })}
          {(bindings ?? [])
            .flatMap((b) => b.tool_ids)
            .slice(0, 4)
            .map((id) => (
              <span key={id} className="ml-2 font-mono text-xs text-muted-foreground">
                {id}
              </span>
            ))}
        </p>
      ) : (
        <Button
          type="button"
          size="sm"
          disabled={pending}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              try {
                const { authorizeUrl } = await startGoogleConnection(agentId);
                window.location.href = authorizeUrl;
              } catch {
                setError(
                  t("connections.error", {
                    defaultValue: "Could not start Google OAuth (check credentials).",
                  }),
                );
              }
            });
          }}
        >
          {t("connections.connectGoogle", { defaultValue: "Connect Google" })}
        </Button>
      )}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <p className="text-[11px] text-muted-foreground">
        {t("connections.scaffolded", {
          defaultValue: "Microsoft, Slack, and Notion connectors are scaffolded (disabled).",
        })}
      </p>
    </div>
  );
}
