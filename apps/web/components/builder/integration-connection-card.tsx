"use client";

import { ExternalLink, Loader2 } from "lucide-react";
import { useMemo, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { useTranslation } from "@/hooks/use-translation";
import { startGoogleConnection, revokeConnection } from "@/lib/actions/connections";
import { getConnectToken } from "@/lib/actions/integrations";
import { cn } from "@/lib/utils";

export type IntegrationConnectionStatus =
  | "connected"
  | "disconnected"
  | "needs_setup"
  | "error"
  | string;

export interface IntegrationConnectionCardProps {
  provider: string;
  appId?: string;
  agentId: string;
  toolIds?: string[];
  onConnected?: () => void;
  status?: IntegrationConnectionStatus;
  accountEmail?: string;
  connectionId?: string;
  className?: string;
}

function providerLabel(
  provider: string,
  t: (key: string, opts?: { defaultValue?: string }) => string,
): string {
  const key = `connections.providers.${provider}`;
  return t(key, { defaultValue: provider.charAt(0).toUpperCase() + provider.slice(1) });
}

export function IntegrationConnectionCard({
  provider,
  appId,
  agentId,
  toolIds,
  onConnected,
  status,
  accountEmail,
  connectionId,
  className,
}: IntegrationConnectionCardProps) {
  const { t } = useTranslation("builder");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [pipedreamFallback, setPipedreamFallback] = useState<{
    token?: string | null;
    connectLinkUrl?: string | null;
    message?: string;
  } | null>(null);

  const normalized = (provider || "native").toLowerCase();
  const connected =
    status === "connected" || Boolean(accountEmail && status !== "error" && status !== "disconnected");

  const title = useMemo(() => {
    if (appId) return appId;
    return providerLabel(normalized, t);
  }, [appId, normalized, t]);

  const connectGoogle = () => {
    setError(null);
    startTransition(async () => {
      try {
        const { authorizeUrl } = await startGoogleConnection(
          agentId,
          toolIds && toolIds.length > 0 ? toolIds : undefined,
        );
        onConnected?.();
        window.location.href = authorizeUrl;
      } catch {
        setError(t("connections.error", { defaultValue: "Could not start the connection." }));
      }
    });
  };

  const connectPipedream = () => {
    setError(null);
    setPipedreamFallback(null);
    startTransition(async () => {
      try {
        const result = await getConnectToken(undefined, appId || undefined);
        if (result.connectLinkUrl && !result.degraded) {
          onConnected?.();
          window.open(result.connectLinkUrl, "_blank", "noopener,noreferrer");
          return;
        }
        setPipedreamFallback({
          token: result.token,
          connectLinkUrl: result.connectLinkUrl,
          message: result.message,
        });
        if (!result.degraded) onConnected?.();
      } catch {
        setError(
          t("connections.pipedreamError", {
            defaultValue: "Could not start Pipedream Connect.",
          }),
        );
      }
    });
  };

  const disconnect = () => {
    if (!connectionId) return;
    setError(null);
    startTransition(async () => {
      try {
        await revokeConnection(connectionId);
        onConnected?.();
      } catch {
        setError(
          t("connections.disconnectError", {
            defaultValue: "Could not disconnect this account.",
          }),
        );
      }
    });
  };

  const handleConnect = () => {
    if (normalized === "google") {
      connectGoogle();
      return;
    }
    if (normalized === "pipedream") {
      connectPipedream();
      return;
    }
    // Generic providers currently route through Pipedream connect tokens.
    connectPipedream();
  };

  return (
    <div className={cn("rounded-xl border border-border p-4 space-y-3", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-medium truncate">{title}</h3>
          <p className="text-xs text-muted-foreground">
            {t(`connections.hints.${normalized}`, {
              defaultValue: t("connections.genericHint", {
                defaultValue: "Connect an account so this agent can use the integration.",
              }),
            })}
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium",
            connected
              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              : status === "error"
                ? "bg-destructive/10 text-destructive"
                : "bg-amber-500/10 text-amber-800 dark:text-amber-300",
          )}
        >
          {connected
            ? t("connections.connected", { defaultValue: "Connected" })
            : status === "error"
              ? t("connections.errorStatus", { defaultValue: "Error" })
              : t("connections.needsSetup", { defaultValue: "Needs setup" })}
        </span>
      </div>

      {accountEmail ? (
        <p className="text-xs text-muted-foreground truncate">
          {t("connections.account", { defaultValue: "Account" })}: {accountEmail}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {connected ? (
          <>
            {connectionId ? (
              <Button type="button" size="sm" variant="outline" disabled={pending} onClick={disconnect}>
                {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : null}
                {t("connections.disconnect", { defaultValue: "Disconnect" })}
              </Button>
            ) : null}
            <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={handleConnect}>
              {t("connections.change", { defaultValue: "Change" })}
            </Button>
          </>
        ) : (
          <Button
            type="button"
            size="sm"
            className="rounded-full bg-brand text-white hover:bg-brand/90"
            disabled={pending}
            onClick={handleConnect}
          >
            {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : null}
            {normalized === "google"
              ? t("connections.connectGoogle", { defaultValue: "Connect Google" })
              : t("connections.connect", {
                  defaultValue: `Connect ${providerLabel(normalized, t)}`,
                  provider: providerLabel(normalized, t),
                })}
          </Button>
        )}
      </div>

      {pipedreamFallback ? (
        <div className="space-y-2 rounded-lg border border-border/70 bg-foreground/[0.02] p-3 text-xs text-muted-foreground">
          <p>
            {pipedreamFallback.message ||
              t("connections.pipedreamFallback", {
                defaultValue:
                  "Continue in Pipedream to finish connecting. Open the link below, then return here.",
              })}
          </p>
          {pipedreamFallback.connectLinkUrl ? (
            <a
              href={pipedreamFallback.connectLinkUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-brand hover:underline"
            >
              <ExternalLink className="size-3" aria-hidden="true" />
              {t("connections.continuePipedream", { defaultValue: "Continue in Pipedream" })}
            </a>
          ) : null}
        </div>
      ) : null}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
