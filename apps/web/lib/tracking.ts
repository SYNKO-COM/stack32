import { publicEnv } from "@/lib/env";

/** Optional public IDs. Empty string = tracker disabled. */
export const POSTHOG_KEY =
  publicEnv.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN ??
  publicEnv.NEXT_PUBLIC_POSTHOG_KEY ??
  "";
/** Ingest host from the PostHog project (this workspace uses US cloud). */
export const POSTHOG_HOST =
  publicEnv.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";
export const META_PIXEL_ID = publicEnv.NEXT_PUBLIC_META_PIXEL_ID ?? "";
export const TIKTOK_PIXEL_ID = publicEnv.NEXT_PUBLIC_TIKTOK_PIXEL_ID ?? "";

export const isPostHogConfigured = Boolean(POSTHOG_KEY);
export const isMetaPixelConfigured = Boolean(META_PIXEL_ID);
export const isTikTokPixelConfigured = Boolean(TIKTOK_PIXEL_ID);
