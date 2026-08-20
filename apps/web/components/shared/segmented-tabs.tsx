"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

export interface SegmentedTabItem<T extends string> {
  id: T;
  href: string;
  label: string;
  icon: LucideIcon;
}

/**
 * Closed tab = icon only. Active tab = icon + label.
 * Default control sizes (do not shrink typography/hit targets).
 */
export function SegmentedTabs<T extends string>({
  items,
  active,
  layoutId,
  ariaLabel,
  className,
}: {
  items: readonly SegmentedTabItem<T>[];
  active: T;
  layoutId: string;
  ariaLabel: string;
  className?: string;
}) {
  const reducedMotion = useReducedMotion();

  return (
    <nav
      aria-label={ariaLabel}
      className={cn(
        "glass inline-flex w-fit max-w-full shrink-0 items-center gap-0.5 rounded-full p-1",
        className,
      )}
    >
      {items.map(({ id, href, icon: Icon, label }) => {
        const isActive = id === active;
        return (
          <Link
            key={id}
            href={href}
            aria-current={isActive ? "page" : undefined}
            title={label}
            className={cn(
              "relative flex shrink-0 items-center justify-center gap-1.5 rounded-full py-1.5 text-sm transition-colors",
              isActive
                ? "px-3 text-foreground"
                : "size-9 px-0 text-muted-foreground hover:text-foreground/80",
            )}
          >
            {isActive ? (
              <motion.span
                layoutId={layoutId}
                transition={
                  reducedMotion
                    ? { duration: 0 }
                    : { type: "spring", bounce: 0.2, duration: 0.5 }
                }
                className="glass-strong absolute inset-0 rounded-full bg-foreground/[0.06]"
                aria-hidden="true"
              />
            ) : null}
            <Icon className="relative z-10 size-4 shrink-0" aria-hidden="true" />
            {isActive ? (
              <span className="relative z-10 whitespace-nowrap">{label}</span>
            ) : (
              <span className="sr-only">{label}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
