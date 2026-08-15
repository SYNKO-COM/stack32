"use client";

import { ExternalLink, Loader2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { useTranslation } from "@/hooks/use-translation";
import { startGoogleConnection, revokeConnection } from "@/lib/actions/connections";
import { getConnectToken, syncIntegrationAccounts } from "@/lib/actions/integrations";
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
  /** Fired only after a real account is linked (never on Connect click alone). */
  onConnected?: () => void;
  /** Fired on disconnect / local refresh — must NOT resume the builder. */
  onChanged?: () => void;
  status?: IntegrationConnectionStatus;
  accountEmail?: string;
  connectionId?: string;
  className?: string;
}

function humanizeAppSlug(raw: string): string {
  const slug = raw.trim().toLowerCase();
  const known: Record<string, string> = {
    google: "Google",
    slack: "Slack",
    slack_v2: "Slack",
    slack_bot: "Slack",
    notion: "Notion",
    stripe: "Stripe",
    pipedream: "Apps",
    gmail: "Gmail",
    google_calendar: "Google Calendar",
    google_docs: "Google Docs",
    google_sheets: "Google Sheets",
    microsoft_outlook: "Outlook",
  };
  if (known[slug]) return known[slug];
  return slug
    .replace(/_v\d+$/i, "")
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function providerLabel(
  provider: string,
  t: (key: string, opts?: { defaultValue?: string }) => string,
): string {
  const key = `connections.providers.${provider}`;
  return t(key, { defaultValue: humanizeAppSlug(provider) });
}

export function IntegrationConnectionCard({
  provider,
  appId,
  agentId,
  toolIds,
  onConnected,
  onChanged,
  status,
  accountEmail,
  connectionId,
  className,
}: IntegrationConnectionCardProps) {
  const { t } = useTranslation("builder");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [waitingForOauth, setWaitingForOauth] = useState(false);
  const [pipedreamFallback, setPipedreamFallback] = useState<{
    token?: string | null;
    connectLinkUrl?: string | null;
    message?: string;
  } | null>(null);
  const accountsBeforeRef = useRef(0);
  const finishedRef = useRef(false);

  const normalized = (provider || "native").toLowerCase();
  const connected =
    status === "connected" ||
    Boolean(accountEmail && status !== "error" && status !== "disconnected");

  const title = useMemo(() => {
    if (appId) return humanizeAppSlug(appId);
    return providerLabel(normalized, t);
  }, [appId, normalized, t]);

  const connectLabel = useMemo(() => {
    if (appId) {
      return t("connections.connect", {
        defaultValue: `Connect ${humanizeAppSlug(appId)}`,
        provider: humanizeAppSlug(appId),
      });
    }
    if (normalized === "google") {
      return t("connections.connectGoogle", { defaultValue: "Connect my Google" });
    }
    if (normalized === "pipedream") {
      return t("connections.connectApp", { defaultValue: "Connect an app" });
    }
    return t("connections.connect", {
      defaultValue: `Connect ${providerLabel(normalized, t)}`,
      provider: providerLabel(normalized, t),
    });
  }, [appId, normalized, t]);

  /** Detect a newly linked account. Existing-account bind only via explicit confirm. */
  const finishIfLinked = async (opts?: { allowExistingBind?: boolean }): Promise<boolean> => {
    if (finishedRef.current) return true;
    const synced = await syncIntegrationAccounts({
      appId: appId || undefined,
      agentId,
      toolIds: toolIds && toolIds.length > 0 ? toolIds : undefined,
    });
    const count = synced.accounts?.length ?? 0;
    const newlyAppeared = count > accountsBeforeRef.current;
    const existingBound =
      Boolean(opts?.allowExistingBind) && Boolean(synced.binding) && count > 0;
    if (!newlyAppeared && !existingBound) {
      return false;
    }
    finishedRef.current = true;
    setWaitingForOauth(false);
    setError(null);
    onConnected?.();
    onChanged?.();
    return true;
  };

  useEffect(() => {
    if (!waitingForOauth) return;

    const onFocus = () => {
      void finishIfLinked().then((ok) => {
        if (!ok) {
          setError(
            t("connections.waitingHint", {
              defaultValue:
                "Still waiting for the account… Finish connecting in the other window, then click “I’ve connected”.",
            }),
          );
        }
      });
    };
    window.addEventListener("focus", onFocus);
    const timer = window.setInterval(() => {
      void finishIfLinked();
    }, 4000);

    return () => {
      window.removeEventListener("focus", onFocus);
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only while waiting
  }, [waitingForOauth, agentId, appId]);

  const connectGoogle = () => {
    setError(null);
    startTransition(async () => {
      try {
        const { authorizeUrl } = await startGoogleConnection(
          agentId,
          toolIds && toolIds.length > 0 ? toolIds : undefined,
        );
        // Standby: do NOT call onConnected. Google OAuth callback resumes
        // the builder only after the account is actually linked.
        setWaitingForOauth(true);
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
        // Baseline *without* toolIds so we don't auto-bind / resume on click.
        const before = await syncIntegrationAccounts({
          appId: appId || undefined,
          agentId,
        });
        accountsBeforeRef.current = before.accounts?.length ?? 0;
        finishedRef.current = false;

        const result = await getConnectToken(appId || undefined);
        if (result.connectLinkUrl && !result.degraded) {
          window.open(result.connectLinkUrl, "_blank", "noopener,noreferrer");
          setWaitingForOauth(true);
          return;
        }
        setPipedreamFallback({
          token: result.token,
          connectLinkUrl: result.connectLinkUrl,
          message: result.message,
        });
        setWaitingForOauth(Boolean(result.connectLinkUrl));
      } catch {
        setError(
          t("connections.pipedreamError", {
            defaultValue: "Could not start Pipedream Connect.",
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
    connectPipedream();
  };

  const disconnect = () => {
    if (!connectionId) return;
    setError(null);
    startTransition(async () => {
      try {
        await revokeConnection(connectionId);
        onChanged?.();
      } catch {
        setError(
          t("connections.disconnectError", {
            defaultValue: "Could not disconnect this account.",
          }),
        );
      }
    });
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
            : waitingForOauth
              ? t("connections.waiting", { defaultValue: "Waiting…" })
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

      {waitingForOauth && !connected ? (
        <div className="space-y-2 rounded-lg border border-amber-500/20 bg-amber-500/[0.06] p-3 text-xs text-amber-950 dark:text-amber-100">
          <p>
            {t("connections.waitingBody", {
              defaultValue:
                "Finish connecting in the other window. Stack32 will continue automatically once the account is linked.",
            })}
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => {
              startTransition(async () => {
                const ok = await finishIfLinked({ allowExistingBind: true });
                if (!ok) {
                  setError(
                    t("connections.notYetLinked", {
                      defaultValue:
                        "No new account detected yet. Complete the connection, then try again.",
                    }),
                  );
                }
              });
            }}
          >
            {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : null}
            {t("connections.iveConnected", { defaultValue: "I’ve connected" })}
          </Button>
        </div>
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
            disabled={pending || waitingForOauth}
            onClick={handleConnect}
          >
            {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : null}
            {connectLabel}
          </Button>
        )}
      </div>

      {pipedreamFallback ? (
        <div className="space-y-2 rounded-lg border border-border/70 bg-foreground/[0.02] p-3 text-xs text-muted-foreground">
          <p>
            {pipedreamFallback.message ||
              t("connections.pipedreamFallback", {
                defaultValue:
                  "Continue in the connect window to finish. Open the link below, then return here.",
              })}
          </p>
          {pipedreamFallback.connectLinkUrl ? (
            <a
              href={pipedreamFallback.connectLinkUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-brand hover:underline"
              onClick={() => setWaitingForOauth(true)}
            >
              <ExternalLink className="size-3" aria-hidden="true" />
              {t("connections.continuePipedream", { defaultValue: "Continue connecting" })}
            </a>
          ) : null}
        </div>
      ) : null}

      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
