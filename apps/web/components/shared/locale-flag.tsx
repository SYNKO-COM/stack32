"use client";

import { useId } from "react";

import type { Locale } from "@/lib/i18n/locales";
import { cn } from "@/lib/utils";

const FLAG_VIEWBOX = "0 0 21 14";

/** Compact SVG flags (not emoji) for the language switcher. */
export function LocaleFlag({
  locale,
  className,
  title,
}: {
  locale: Locale;
  className?: string;
  title?: string;
}) {
  const clipId = useId();

  return (
    <svg
      viewBox={FLAG_VIEWBOX}
      className={cn("h-[15px] w-[22px] shrink-0", className)}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
    >
      {title ? <title>{title}</title> : null}
      <defs>
        <clipPath id={clipId}>
          <rect width="21" height="14" rx="3" ry="3" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        {locale === "fr" ? <FrenchFlag /> : <UsFlag />}
      </g>
    </svg>
  );
}

function FrenchFlag() {
  return (
    <>
      <rect width="7" height="14" fill="#0055A4" />
      <rect x="7" width="7" height="14" fill="#FFFFFF" />
      <rect x="14" width="7" height="14" fill="#EF4135" />
    </>
  );
}

function UsFlag() {
  const stripeHeight = 14 / 13;

  return (
    <>
      <rect width="21" height="14" fill="#B22234" />
      {Array.from({ length: 6 }, (_, index) => (
        <rect
          key={index}
          y={(index * 2 + 1) * stripeHeight}
          width="21"
          height={stripeHeight}
          fill="#FFFFFF"
        />
      ))}
      <rect width="8.4" height={7.69} fill="#3C3B6E" />
      {[
        [1.05, 1.05],
        [2.45, 1.05],
        [3.85, 1.05],
        [5.25, 1.05],
        [6.65, 1.05],
        [1.75, 2.45],
        [3.15, 2.45],
        [4.55, 2.45],
        [5.95, 2.45],
        [1.05, 3.85],
        [2.45, 3.85],
        [3.85, 3.85],
        [5.25, 3.85],
        [6.65, 3.85],
        [1.75, 5.25],
        [3.15, 5.25],
        [4.55, 5.25],
        [5.95, 5.25],
        [1.05, 6.65],
        [2.45, 6.65],
        [3.85, 6.65],
        [5.25, 6.65],
        [6.65, 6.65],
      ].map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="0.42" fill="#FFFFFF" />
      ))}
    </>
  );
}
