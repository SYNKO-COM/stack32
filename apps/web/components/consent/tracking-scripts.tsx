"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

import { useCurrentUser } from "@/hooks/use-auth";
import {
  capturePostHogPageview,
  identifyPostHogUser,
  resetPostHogUser,
  startPostHog,
  stopPostHog,
} from "@/lib/tracking-posthog";
import {
  captureMetaPageview,
  captureTikTokPageview,
  startMetaPixel,
  startTikTokPixel,
  stopMetaPixel,
  stopTikTokPixel,
} from "@/lib/tracking-pixels";
import {
  isMetaPixelConfigured,
  isPostHogConfigured,
  isTikTokPixelConfigured,
} from "@/lib/tracking";

export function TrackingScripts({
  analytics,
  marketing,
}: {
  analytics: boolean;
  marketing: boolean;
}) {
  const pathname = usePathname();
  const { data: user, isPending: userPending } = useCurrentUser();
  const hadIdentifiedUser = useRef(false);

  useEffect(() => {
    let cancelled = false;

    if (analytics && isPostHogConfigured) {
      void startPostHog().then(() => {
        if (!cancelled) capturePostHogPageview(pathname);
      });
    } else {
      stopPostHog();
      hadIdentifiedUser.current = false;
    }

    if (marketing) {
      if (isMetaPixelConfigured) {
        startMetaPixel();
        captureMetaPageview();
      }
      if (isTikTokPixelConfigured) {
        startTikTokPixel();
        captureTikTokPageview();
      }
    } else {
      stopMetaPixel();
      stopTikTokPixel();
    }

    return () => {
      cancelled = true;
    };
  }, [analytics, marketing, pathname]);

  useEffect(() => {
    if (!analytics || !isPostHogConfigured || userPending) return;
    void startPostHog().then(() => {
      if (user?.id) {
        identifyPostHogUser(user.id, { email: user.email });
        hadIdentifiedUser.current = true;
        return;
      }
      if (hadIdentifiedUser.current) {
        resetPostHogUser();
        hadIdentifiedUser.current = false;
      }
    });
  }, [analytics, userPending, user?.id, user?.email]);

  return null;
}
