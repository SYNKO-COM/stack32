"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

/** Soft fade/slide — only for messages that just arrived in this session. */
export function MessageEntrance({
  children,
  active = true,
  className,
}: {
  children: React.ReactNode;
  active?: boolean;
  className?: string;
}) {
  if (!active) {
    return <div className={className}>{children}</div>;
  }
  return (
    <div className={cn("animate-in fade-in-0 slide-in-from-bottom-1 duration-300", className)}>
      {children}
    </div>
  );
}

//: A line should feel typed, not endured. Past this the reveal is a flourish
//: nobody is waiting for, and the person is waiting on the form underneath it.
const MAX_TYPING_MS = 1200;
const MIN_TYPING_MS = 180;

function stripForTyping(text: string): string {
  return text
    .replace(/\*\*/g, "")
    .replace(/^#+\s*/gm, "")
    .replace(/`/g, "")
    .trim();
}

/**
 * Typewriter for freshly streamed assistant text.
 * When `active` is false (page reload / history), renders full text immediately.
 * Stable hooks — toggling `active` never changes hook count in this component.
 */
export function TypewriterText({
  text,
  active = true,
  cps = 48,
  onDone,
  className,
}: {
  text: string;
  active?: boolean;
  cps?: number;
  onDone?: () => void;
  className?: string;
}) {
  const plain = stripForTyping(text);
  const [shown, setShown] = useState(() => (active ? "" : plain));
  const doneRef = useRef(false);
  const onDoneRef = useRef(onDone);

  // Keep the latest onDone without re-running the typing effect (ref synced in effect,
  // not during render, per the react-hooks purity rule).
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    doneRef.current = false;
    const notify = () => {
      if (doneRef.current) return;
      doneRef.current = true;
      onDoneRef.current?.();
    };
    if (!active) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reveal full text immediately on reload/history
      setShown(plain);
      notify();
      return;
    }
    if (!plain) {
      setShown("");
      notify();
      return;
    }
    setShown("");

    // One state update per animation frame, not per character. The old
    // setInterval fired every ~21ms and re-rendered on each letter; as the
    // conversation grew each render cost more, so a 140-character line took
    // minutes to appear while the backend had delivered it instantly, and
    // clicks were dropped while the main thread was busy.
    const duration = Math.min(
      MAX_TYPING_MS,
      Math.max(MIN_TYPING_MS, (plain.length / Math.max(cps, 1)) * 1000),
    );
    const start = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const count = Math.max(1, Math.round(plain.length * progress));
      setShown(plain.slice(0, count));
      if (progress >= 1) {
        notify();
        return;
      }
      frame = window.requestAnimationFrame(step);
    };
    frame = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(frame);
  }, [plain, cps, active]);

  return (
    <span className={cn("whitespace-pre-wrap", className)}>
      {shown}
      {active && shown.length < plain.length ? (
        <span className="ml-0.5 inline-block h-3.5 w-[2px] translate-y-[2px] animate-pulse bg-foreground/50" />
      ) : null}
    </span>
  );
}
