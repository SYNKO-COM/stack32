"use client";

import Image from "next/image";
import Link from "next/link";

import { cn } from "@/lib/utils";

/**
 * Compact brand mark — official mini logo (transparent PNG).
 */
function LogoMark({ className }: { className?: string }) {
  return (
    <Image
      src="/brand/icon.png"
      alt=""
      width={32}
      height={32}
      className={cn("size-8 bg-transparent object-contain", className)}
      aria-hidden="true"
      unoptimized
      priority
    />
  );
}

interface LogoProps {
  href?: string;
  /** Full wordmark (icon + Stack32 text) or compact mark only. */
  withWordmark?: boolean;
  className?: string;
}

/**
 * Official Stack32 logo.
 *
 * Uses the transparent mini-logo PNG + "Stack32" in Sanchez so the wordmark
 * always follows the current theme (black on light, white on dark) without
 * depending on wordmark plate exports that composite poorly on the web.
 */
export function Logo({ href = "/", withWordmark = true, className }: LogoProps) {
  const content = (
    <span className={cn("inline-flex items-center gap-2.5 bg-transparent", className)}>
      <LogoMark />
      {withWordmark ? (
        <span className="font-brand text-[1.35rem] leading-none tracking-tight text-foreground">
          Stack32
        </span>
      ) : null}
    </span>
  );

  if (!href) return content;

  return (
    <Link href={href} className="inline-flex items-center rounded-md bg-transparent" aria-label="Stack32">
      {content}
    </Link>
  );
}

export { LogoMark };
