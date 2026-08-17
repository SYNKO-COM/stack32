"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  acceptAllConsent,
  allowsAnalytics,
  allowsMarketing,
  CONSENT_VERSION,
  defaultDeniedConsent,
  persistConsent,
  type ConsentState,
} from "@/lib/consent";
import { TrackingScripts } from "@/components/consent/tracking-scripts";

type ConsentContextValue = {
  consent: ConsentState | null;
  decided: boolean;
  preferencesOpen: boolean;
  openPreferences: () => void;
  closePreferences: () => void;
  acceptAll: () => void;
  rejectAll: () => void;
  savePreferences: (next: { analytics: boolean; marketing: boolean }) => void;
  doNotSellOrShare: () => void;
};

const ConsentContext = createContext<ConsentContextValue | null>(null);

export function ConsentProvider({
  children,
  initialConsent,
}: {
  children: ReactNode;
  initialConsent: ConsentState | null;
}) {
  const [consent, setConsent] = useState<ConsentState | null>(initialConsent);
  const [preferencesOpen, setPreferencesOpen] = useState(false);

  const commit = useCallback((next: ConsentState) => {
    persistConsent(next);
    setConsent(next);
    setPreferencesOpen(false);
  }, []);

  const acceptAll = useCallback(() => {
    commit(acceptAllConsent());
  }, [commit]);

  const rejectAll = useCallback(() => {
    commit(defaultDeniedConsent());
  }, [commit]);

  const savePreferences = useCallback(
    (next: { analytics: boolean; marketing: boolean }) => {
      commit({
        version: CONSENT_VERSION,
        necessary: true,
        analytics: next.analytics,
        marketing: next.marketing,
        updatedAt: Date.now(),
      });
    },
    [commit],
  );

  const doNotSellOrShare = useCallback(() => {
    commit({
      version: CONSENT_VERSION,
      necessary: true,
      analytics: Boolean(consent?.analytics),
      marketing: false,
      updatedAt: Date.now(),
    });
  }, [commit, consent?.analytics]);

  const value = useMemo<ConsentContextValue>(
    () => ({
      consent,
      decided: consent !== null,
      preferencesOpen,
      openPreferences: () => setPreferencesOpen(true),
      closePreferences: () => setPreferencesOpen(false),
      acceptAll,
      rejectAll,
      savePreferences,
      doNotSellOrShare,
    }),
    [acceptAll, consent, doNotSellOrShare, preferencesOpen, rejectAll, savePreferences],
  );

  return (
    <ConsentContext.Provider value={value}>
      {children}
      <TrackingScripts
        analytics={allowsAnalytics(consent)}
        marketing={allowsMarketing(consent)}
      />
    </ConsentContext.Provider>
  );
}

export function useConsent(): ConsentContextValue {
  const ctx = useContext(ConsentContext);
  if (!ctx) {
    throw new Error("useConsent must be used within ConsentProvider");
  }
  return ctx;
}
