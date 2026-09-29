"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/hooks/use-translation";
import {
  createBrowserSession,
  heartbeatBrowserSession,
  revokeBrowserSession,
} from "@/lib/actions/browser";

export function BrowserSetup({
  installation,
  thread,
  origin,
}: {
  installation: string;
  thread: string;
  origin: string;
}) {
  const { t } = useTranslation("live");
  const [session, setSession] = useState<Awaited<
    ReturnType<typeof createBrowserSession>
  > | null>(null);
  const [state, setState] = useState("idle");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!session) return;
    const id = setInterval(() => {
      void heartbeatBrowserSession(session.id)
        .then((result) => setState(result.state))
        .catch(() => {
          setState("stopped");
          setSession(null);
        });
    }, 5000);
    return () => clearInterval(id);
  }, [session]);
  async function connect() {
    setBusy(true);
    try {
      setSession(await createBrowserSession(installation, thread, origin));
      setState("pairing");
    } catch {
      setState("error");
    } finally {
      setBusy(false);
    }
  }
  async function stop() {
    if (!session) return;
    setBusy(true);
    try {
      await revokeBrowserSession(session.id);
    } finally {
      setSession(null);
      setState("stopped");
      setBusy(false);
    }
  }
  return (
    <main className="mx-auto max-w-2xl space-y-6 p-8">
      <h1 className="text-2xl font-semibold">{t("browser.title")}</h1>
      <p>{t("browser.explanation")}</p>
      <ol className="list-decimal space-y-4 pl-6">
        <li>
          <p>{t("browser.install")}</p>
          <a
            className="underline"
            href="/downloads/stack32-chrome-preprod-0.1.0.zip"
          >
            {t("browser.download")}
          </a>
          <p className="text-sm text-muted-foreground">{t("browser.unpack")}</p>
        </li>
        <li>
          <p>{t("browser.pair")}</p>
          <p className="my-2 break-all font-medium">{origin}</p>
          <Button
            disabled={busy || !!session || !installation || !thread || !origin}
            onClick={connect}
          >
            {t("browser.connect")}
          </Button>
        </li>
        <li>
          <p>{t("browser.authorize")}</p>
          {session && (
            <>
              <p className="font-semibold">
                {session.agent_name} · {session.origin}
              </p>
              {state === "pairing" && (
                <code className="my-3 block break-all rounded border p-3 select-all">
                  {session.pairing_code}
                </code>
              )}
            </>
          )}
        </li>
      </ol>
      <p role="status" aria-live="polite">
        {t(`browser.${state}`)}
      </p>
      {session && (
        <>
          <p>{t("browser.keepOpen")}</p>
          <Button variant="outline" disabled={busy} onClick={stop}>
            {t("browser.stop")}
          </Button>
        </>
      )}
      <p>{t("browser.limits")}</p>
      <a className="underline" href="/browser/privacy">
        {t("browser.privacy")}
      </a>
    </main>
  );
}
