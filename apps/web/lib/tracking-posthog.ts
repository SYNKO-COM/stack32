"use client";

import { POSTHOG_HOST, POSTHOG_KEY } from "@/lib/tracking";

type PostHogClient = {
  init: (key: string, options: Record<string, unknown>) => void;
  capture: (event: string, properties?: Record<string, unknown>) => void;
  identify: (distinctId: string, properties?: Record<string, unknown>) => void;
  opt_in_capturing?: () => void;
  opt_out_capturing: () => void;
  stopSessionRecording?: () => void;
  reset: () => void;
};

let client: PostHogClient | null = null;
let started = false;
let identifiedId: string | null = null;

/**
 * Loaded only after analytics consent. We do not use instrumentation-client.ts:
 * that file would init PostHog on every page load, before the visitor chooses.
 *
 * @see https://posthog.com/docs/libraries/next-js
 */
export async function startPostHog(): Promise<void> {
  if (!POSTHOG_KEY) return;
  if (client && !started) {
    client.opt_in_capturing?.();
    started = true;
    return;
  }
  if (started) return;
  const mod = await import("posthog-js");
  client = mod.default as unknown as PostHogClient;
  client.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    // Current PostHog JS defaults snapshot (wizard / Next.js 15.3+ docs).
    defaults: "2026-05-30",
    person_profiles: "identified_only",
    capture_pageview: false,
    capture_pageleave: true,
    persistence: "localStorage+cookie",
    session_recording: {
      maskAllInputs: true,
    },
  });
  started = true;
}

export function capturePostHogPageview(url?: string): void {
  if (!started || !client) return;
  client.capture("$pageview", url ? { $current_url: url } : undefined);
}

export function identifyPostHogUser(
  distinctId: string,
  properties?: Record<string, unknown>,
): void {
  if (!started || !client || !distinctId) return;
  if (identifiedId === distinctId) return;
  client.identify(distinctId, properties);
  identifiedId = distinctId;
}

export function resetPostHogUser(): void {
  if (!client) return;
  identifiedId = null;
  try {
    client.reset();
  } catch {
    // ignore
  }
}

export function stopPostHog(): void {
  if (!client) return;
  try {
    client.stopSessionRecording?.();
    client.opt_out_capturing();
    client.reset();
  } catch {
    // SDK may not be fully initialised.
  }
  identifiedId = null;
  started = false;
}
