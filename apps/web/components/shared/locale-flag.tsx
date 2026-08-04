import type { Locale } from "@/lib/i18n/locales";
import { cn } from "@/lib/utils";

/** Compact SVG flags — not emoji — for the language switcher. */
export function LocaleFlag({
  locale,
  className,
  title,
}: {
  locale: Locale;
  className?: string;
  title?: string;
}) {
  if (locale === "fr") {
    return (
      <svg
        viewBox="0 0 24 16"
        className={cn("h-3.5 w-[21px] shrink-0 rounded-[2px] shadow-sm ring-1 ring-black/10", className)}
        aria-hidden={title ? undefined : true}
        role={title ? "img" : undefined}
      >
        {title ? <title>{title}</title> : null}
        <rect width="8" height="16" fill="#002395" />
        <rect x="8" width="8" height="16" fill="#fff" />
        <rect x="16" width="8" height="16" fill="#ED2939" />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 24 16"
      className={cn("h-3.5 w-[21px] shrink-0 rounded-[2px] shadow-sm ring-1 ring-black/10", className)}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
    >
      {title ? <title>{title}</title> : null}
      <rect width="24" height="16" fill="#B22234" />
      <g fill="#fff">
        <rect y="1.23" width="24" height="1.23" />
        <rect y="3.69" width="24" height="1.23" />
        <rect y="6.15" width="24" height="1.23" />
        <rect y="8.62" width="24" height="1.23" />
        <rect y="11.08" width="24" height="1.23" />
        <rect y="13.54" width="24" height="1.23" />
      </g>
      <rect width="9.6" height="8.62" fill="#3C3B6E" />
      <g fill="#fff">
        {[0.8, 2.4, 4, 5.6, 7.2].map((y) =>
          [0.9, 2.5, 4.1, 5.7, 7.3, 8.9].map((x) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r="0.35" />
          )),
        )}
      </g>
    </svg>
  );
}
