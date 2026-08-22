"use client";

import { ExternalLink, Loader2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { useTranslation } from "@/hooks/use-translation";
import { startGoogleConnection, revokeConnection, disconnectAgentApp } from "@/lib/actions/connections";
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

/** Named popup so sequential Connect clicks reuse the same window. */
const CONNECT_POPUP_NAME = "stack32_pipedream_connect";
const CONNECT_POPUP_FEATURES =
  "popup=yes,width=560,height=720,scrollbars=yes,resizable=yes";

type ConnectPopupCopy = {
  title: string;
  heading: string;
  body: string;
  hint: string;
};

/**
 * Open a blank shell *synchronously* inside the click handler.
 * Browsers block window.open() after await (lost user gesture).
 */
function openConnectPopupShell(copy: ConnectPopupCopy): Window | null {
  const popup = window.open("about:blank", CONNECT_POPUP_NAME, CONNECT_POPUP_FEATURES);
  if (!popup) return null;
  try {
    const title = copy.title.replace(/</g, "&lt;");
    const heading = copy.heading.replace(/</g, "&lt;");
    const body = copy.body.replace(/</g, "&lt;");
    const hint = copy.hint.replace(/</g, "&lt;");
    popup.document.open();
    popup.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
      background:
        radial-gradient(1200px 600px at 10% -10%, rgba(252, 184, 2, 0.22), transparent 55%),
        radial-gradient(900px 500px at 100% 0%, rgba(250, 114, 11, 0.16), transparent 50%),
        #faf9f7;
      color: #1c1917;
    }
    .card {
      width: min(100%, 380px);
      text-align: center;
      padding: 28px 24px 26px;
      border-radius: 20px;
      background: rgba(255, 255, 255, 0.82);
      border: 1px solid rgba(28, 25, 23, 0.08);
      box-shadow: 0 18px 40px rgba(28, 25, 23, 0.08);
      backdrop-filter: blur(8px);
    }
    .mark {
      width: 44px;
      height: 44px;
      margin: 0 auto 16px;
      border-radius: 14px;
      background: linear-gradient(135deg, #fcb802 0%, #fa720b 100%);
      box-shadow: 0 8px 18px rgba(250, 138, 11, 0.35);
    }
    .brand {
      margin: 0 0 18px;
      font-size: 13px;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: #78716c;
    }
    h1 {
      margin: 0 0 10px;
      font-size: 1.2rem;
      line-height: 1.35;
      font-weight: 650;
    }
    p {
      margin: 0;
      font-size: 0.95rem;
      line-height: 1.5;
      color: #57534e;
    }
    .hint {
      margin-top: 14px;
      font-size: 0.85rem;
      color: #a8a29e;
    }
    .spinner {
      width: 28px;
      height: 28px;
      margin: 22px auto 0;
      border-radius: 999px;
      border: 2.5px solid rgba(250, 138, 11, 0.2);
      border-top-color: #fa8a0b;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="card" role="status" aria-live="polite">
    <div class="mark" aria-hidden="true"></div>
    <p class="brand">Stack32</p>
    <h1>${heading}</h1>
    <p>${body}</p>
    <p class="hint">${hint}</p>
    <div class="spinner" aria-hidden="true"></div>
  </div>
</body>
</html>`);
    popup.document.close();
  } catch {
    // Some browsers restrict writes to about:blank briefly — navigation still works.
  }
  return popup;
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
    x_ai: "xAI",
    xai: "xAI",
    mistral_ai: "Mistral",
    openai: "OpenAI",
    anthropic: "Anthropic",
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
  const [popupBlocked, setPopupBlocked] = useState(false);
  /** Optimistic override so Disconnect feels instant and survives stale refetch. */
  const [localOverride, setLocalOverride] = useState<"connected" | "disconnected" | null>(
    null,
  );
  const [pipedreamFallback, setPipedreamFallback] = useState<{
    token?: string | null;
    connectLinkUrl?: string | null;
    message?: string;
  } | null>(null);
  const accountsBeforeRef = useRef(0);
  const finishedRef = useRef(false);
  const connectLinkUrlRef = useRef<string | null>(null);
  /** Mirrored into state because the render below uses it as a fallback URL. */
  const [connectLinkUrl, setConnectLinkUrl] = useState<string | null>(null);
  const popupRef = useRef<Window | null>(null);

  const normalized = (provider || "native").toLowerCase();
  const googleProductApps = new Set([
    "gmail",
    "google_calendar",
    "google_docs",
    "google_sheets",
    "google_drive",
    "google_slides",
    "google",
  ]);
  /** Always use Pipedream Connect for Google product apps (per-app accounts). */
  const usePipedreamConnect =
    normalized === "pipedream" ||
    (normalized === "google" && Boolean(appId)) ||
    (appId != null && googleProductApps.has(appId.toLowerCase()));

  const parentConnected =
    status === "connected" ||
    Boolean(accountEmail && status !== "error" && status !== "disconnected");

  // Adjust optimistic override during render when the parent has caught up
  // (React-recommended alternative to syncing props → state in an effect).
  const [prevParentConnected, setPrevParentConnected] = useState(parentConnected);
  if (parentConnected !== prevParentConnected) {
    setPrevParentConnected(parentConnected);
    if (localOverride === "disconnected" && !parentConnected) {
      setLocalOverride(null);
    }
  }

  const connected =
    localOverride === "disconnected"
      ? false
      : localOverride === "connected"
        ? true
        : parentConnected;

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
    if (normalized === "google" && !usePipedreamConnect) {
      return t("connections.connectGoogle", { defaultValue: "Connect my Google" });
    }
    if (normalized === "pipedream" || usePipedreamConnect) {
      return t("connections.connectApp", { defaultValue: "Connect an app" });
    }
    return t("connections.connect", {
      defaultValue: `Connect ${providerLabel(normalized, t)}`,
      provider: providerLabel(normalized, t),
    });
  }, [appId, normalized, t, usePipedreamConnect]);

  /** Detect a newly linked account. Existing-account bind only via explicit confirm. */
  const finishIfLinked = async (opts?: { allowExistingBind?: boolean }): Promise<boolean> => {
    if (finishedRef.current) return true;
    const synced = await syncIntegrationAccounts({
      appId: appId || undefined,
      agentId,
      toolIds: toolIds && toolIds.length > 0 ? toolIds : undefined,
    });
    const accounts = synced.accounts ?? [];
    const count = accounts.length;
    const activeAccounts = accounts.filter((a) => {
      const st = String(a.status ?? "active").toLowerCase();
      return st === "active" || st === "connected" || st === "ok" || st === "";
    });
    const newlyAppeared = count > accountsBeforeRef.current;
    const hasActiveForApp = activeAccounts.length > 0;
    const existingBound =
      Boolean(opts?.allowExistingBind) && Boolean(synced.binding) && hasActiveForApp;
    // While waiting on OAuth, any active synced account for this app means success —
    // count may not increase when Pipedream reuses an account (Google Calendar).
    const oauthReady = waitingForOauth && hasActiveForApp;

    if (!newlyAppeared && !existingBound && !oauthReady) {
      return false;
    }
    finishedRef.current = true;
    setWaitingForOauth(false);
    setPopupBlocked(false);
    setPipedreamFallback(null);
    setLocalOverride("connected");
    setError(null);
    try {
      popupRef.current?.close();
    } catch {
      /* ignore */
    }
    popupRef.current = null;
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

    // Must run in the same turn as the click — before any await.
    const popup = openConnectPopupShell({
      title: t("connections.popupTitle", { defaultValue: "Stack32" }),
      heading: t("connections.popupHeading", {
        defaultValue: "Preparing a secure connection",
      }),
      body: t("connections.popupBody", {
        defaultValue:
          "Please keep this window open and don’t close it. The app connection screen will open here in a moment.",
      }),
      hint: t("connections.popupHint", {
        defaultValue: "This usually takes just a few seconds.",
      }),
    });
    popupRef.current = popup;
    const blocked = !popup || popup.closed;
    setPopupBlocked(blocked);

    startTransition(async () => {
      try {
        finishedRef.current = false;
        // Start token fetch immediately — sync baseline can finish after redirect.
        const tokenPromise = getConnectToken(appId || undefined);
        const syncPromise = syncIntegrationAccounts({
          appId: appId || undefined,
          agentId,
        }).then((before) => {
          accountsBeforeRef.current = before.accounts?.length ?? 0;
          return before;
        });

        const result = await tokenPromise;
        const url = result.connectLinkUrl?.trim() || null;
        connectLinkUrlRef.current = url;
        setConnectLinkUrl(url);

        if (!url || result.degraded) {
          try {
            popup?.close();
          } catch {
            /* ignore */
          }
          popupRef.current = null;
          await syncPromise.catch(() => undefined);
          setPipedreamFallback({
            token: result.token,
            connectLinkUrl: url,
            message: result.message,
          });
          setWaitingForOauth(Boolean(url));
          return;
        }

        if (popup && !popup.closed) {
          popup.location.href = url;
          setWaitingForOauth(true);
          setPopupBlocked(false);
          void syncPromise.catch(() => undefined);
          return;
        }

        // Popup blocked: keep waiting UI + in-page link (user click = allowed gesture).
        await syncPromise.catch(() => undefined);
        setPopupBlocked(true);
        setPipedreamFallback({
          token: result.token,
          connectLinkUrl: url,
          message: t("connections.popupBlocked", {
            defaultValue:
              "Your browser blocked the connect window. Open the link below, finish connecting, then click “I’ve connected”.",
          }),
        });
        setWaitingForOauth(true);
      } catch {
        try {
          popup?.close();
        } catch {
          /* ignore */
        }
        popupRef.current = null;
        setError(
          t("connections.pipedreamError", {
            defaultValue: "Could not start Pipedream Connect.",
          }),
        );
      }
    });
  };

  const handleConnect = () => {
    // Google Calendar / Gmail / Docs → Pipedream Connect (per-app account).
    if (usePipedreamConnect || normalized !== "google") {
      connectPipedream();
      return;
    }
    connectGoogle();
  };

  const cancelWaiting = () => {
    setWaitingForOauth(false);
    setPopupBlocked(false);
    setPipedreamFallback(null);
    setError(null);
    finishedRef.current = false;
    try {
      popupRef.current?.close();
    } catch {
      /* ignore */
    }
    popupRef.current = null;
  };

  const disconnect = () => {
    setError(null);
    // Instant UI: flip to disconnected before the network round-trip.
    setLocalOverride("disconnected");
    startTransition(async () => {
      try {
        if (appId) {
          await disconnectAgentApp({
            agentId,
            appId,
            toolIds,
            connectionId,
          });
        } else if (connectionId) {
          await revokeConnection(connectionId);
        } else {
          throw new Error("missing_app_and_connection");
        }

        onChanged?.();
      } catch {
        setLocalOverride(null);
        setError(
          t("connections.disconnectError", {
            defaultValue: "Could not disconnect this account.",
          }),
        );
      }
    });
  };

  const fallbackUrl = pipedreamFallback?.connectLinkUrl || connectLinkUrl;

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
            {popupBlocked
              ? t("connections.popupBlocked", {
                  defaultValue:
                    "Your browser blocked the connect window. Open the link below, finish connecting, then click “I’ve connected”.",
                })
              : t("connections.waitingBody", {
                  defaultValue:
                    "Finish connecting in the other window. Stack32 will continue automatically once the account is linked.",
                })}
          </p>
          <div className="flex flex-wrap gap-2">
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
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={handleConnect}
            >
              {t("connections.reopenWindow", {
                defaultValue: "Reopen connect window",
              })}
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={cancelWaiting}>
              {t("connections.cancelWaiting", { defaultValue: "Cancel" })}
            </Button>
          </div>
          {fallbackUrl ? (
            <a
              href={fallbackUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-medium text-brand hover:underline"
              onClick={() => {
                setPopupBlocked(false);
                setWaitingForOauth(true);
              }}
            >
              <ExternalLink className="size-3" aria-hidden="true" />
              {t("connections.continuePipedream", { defaultValue: "Continue connecting" })}
            </a>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {connected ? (
          <>
            <Button type="button" size="sm" variant="outline" disabled={pending} onClick={disconnect}>
              {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : null}
              {t("connections.disconnect", { defaultValue: "Disconnect" })}
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={handleConnect}>
              {t("connections.change", { defaultValue: "Change" })}
            </Button>
          </>
        ) : waitingForOauth ? null : (
          <Button
            type="button"
            size="sm"
            className="rounded-full bg-brand text-white hover:bg-brand/90"
            disabled={pending}
            onClick={handleConnect}
          >
            {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : null}
            {connectLabel}
          </Button>
        )}
      </div>

      {pipedreamFallback && !waitingForOauth ? (
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
