"use client";

import { META_PIXEL_ID, TIKTOK_PIXEL_ID } from "@/lib/tracking";

declare global {
  interface Window {
    fbq?: ((...args: unknown[]) => void) & { queue?: unknown[] };
    _fbq?: unknown;
    ttq?: {
      load: (id: string) => void;
      page: () => void;
      track?: (event: string) => void;
    };
    TiktokAnalyticsObject?: string;
  }
}

const META_SCRIPT_ID = "stack32-meta-pixel";
const TIKTOK_SCRIPT_ID = "stack32-tiktok-pixel";

function ensureMetaStub(): void {
  if (typeof window === "undefined" || window.fbq) return;
  const fbq = function (...args: unknown[]) {
    (fbq.queue ??= []).push(args);
  } as NonNullable<Window["fbq"]>;
  fbq.queue = [];
  window.fbq = fbq;
  window._fbq = fbq;
}

export function startMetaPixel(): void {
  if (!META_PIXEL_ID || typeof document === "undefined") return;
  ensureMetaStub();
  window.fbq?.("consent", "grant");
  window.fbq?.("init", META_PIXEL_ID);
  if (document.getElementById(META_SCRIPT_ID)) return;
  const script = document.createElement("script");
  script.id = META_SCRIPT_ID;
  script.async = true;
  script.src = "https://connect.facebook.net/en_US/fbevents.js";
  document.head.appendChild(script);
}

export function captureMetaPageview(): void {
  window.fbq?.("track", "PageView");
}

export function stopMetaPixel(): void {
  window.fbq?.("consent", "revoke");
}

export function startTikTokPixel(): void {
  if (!TIKTOK_PIXEL_ID || typeof document === "undefined") return;
  if (document.getElementById(TIKTOK_SCRIPT_ID)) return;
  const script = document.createElement("script");
  script.id = TIKTOK_SCRIPT_ID;
  script.async = true;
  script.src = `https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=${encodeURIComponent(TIKTOK_PIXEL_ID)}&lib=ttq`;
  script.onload = () => {
    window.ttq?.load(TIKTOK_PIXEL_ID);
    window.ttq?.page();
  };
  document.head.appendChild(script);
}

export function captureTikTokPageview(): void {
  window.ttq?.page();
}

export function stopTikTokPixel(): void {
  window.ttq = undefined;
}
