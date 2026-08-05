"use client";

import { useEffect, useState } from "react";

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

function stripForTyping(text: string): string {
  return text
    .replace(/\*\*/g, "")
    .replace(/^#+\s*/gm, "")
    .replace(/`/g, "")
    .trim();
}

function ImmediateText({
  text,
  onDone,
  className,
}: {
  text: string;
  onDone?: () => void;
  className?: string;
}) {
  useEffect(() => {
    onDone?.();
  }, [onDone]);

  return <span className={cn("whitespace-pre-wrap", className)}>{text}</span>;
}

function ActiveTypewriter({
  plain,
  cps,
  onDone,
  className,
}: {
  plain: string;
  cps: number;
  onDone?: () => void;
  className?: string;
}) {
  const [shown, setShown] = useState("");

  useEffect(() => {
    if (!plain) {
      onDone?.();
      return;
    }
    let i = 0;
    let doneFired = false;
    const id = window.setInterval(() => {
      i += 1;
      setShown(plain.slice(0, i));
      if (i >= plain.length) {
        window.clearInterval(id);
        if (!doneFired) {
          doneFired = true;
          onDone?.();
        }
      }
    }, Math.max(12, Math.round(1000 / cps)));
    return () => window.clearInterval(id);
  }, [plain, cps, onDone]);

  return (
    <span className={cn("whitespace-pre-wrap", className)}>
      {shown}
      {shown.length < plain.length ? (
        <span className="ml-0.5 inline-block h-3.5 w-[2px] translate-y-[2px] animate-pulse bg-foreground/50" />
      ) : null}
    </span>
  );
}

/**
 * Typewriter for freshly streamed assistant text.
 * When `active` is false (page reload / history), renders full text immediately.
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
  if (!active) {
    return <ImmediateText text={plain} onDone={onDone} className={className} />;
  }
  return (
    <ActiveTypewriter key={plain} plain={plain} cps={cps} onDone={onDone} className={className} />
  );
}
