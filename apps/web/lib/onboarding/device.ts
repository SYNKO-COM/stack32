"use client";

import { useSyncExternalStore } from "react";

export type Experience = "mobile" | "desktop";
const KEY = "stack32.onboardingExperience.v3";
export function classifyDevice(userAgent: string, touchPoints: number, coarsePointer: boolean): Experience {
  return /Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(userAgent) || (/Macintosh/i.test(userAgent) && touchPoints > 1) || (touchPoints > 1 && coarsePointer) ? "mobile" : "desktop";
}
export function deviceExperience(): Experience {
  if (typeof window === "undefined") return "desktop";
  try {
    const pinned = sessionStorage.getItem(KEY);
    if (pinned === "mobile" || pinned === "desktop") return pinned;
  } catch { /* private mode */ }
  const value = classifyDevice(navigator.userAgent, navigator.maxTouchPoints, matchMedia("(pointer: coarse)").matches);
  try { sessionStorage.setItem(KEY, value); } catch { /* private mode */ }
  return value;
}
const subscribe = () => () => {};
export function useOnboardingExperience(): Experience | null {
  return useSyncExternalStore(subscribe, deviceExperience, () => null);
}
