"use client";

import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

export function RoundCheck({
  checked,
  onChange,
  disabled,
  className,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("relative mt-0.5 inline-flex size-5 shrink-0", className)}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="peer absolute inset-0 z-10 cursor-pointer opacity-0 disabled:cursor-not-allowed"
      />
      <span
        className={cn(
          "pointer-events-none flex size-5 items-center justify-center rounded-full border-2 transition-colors",
          checked
            ? "border-brand bg-brand text-white shadow-[0_0_0_3px_color-mix(in_srgb,var(--brand,#e36b2c)_20%,transparent)]"
            : "border-border/80 bg-background",
          "peer-focus-visible:ring-2 peer-focus-visible:ring-brand/35 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background",
          "peer-disabled:opacity-50",
        )}
        aria-hidden="true"
      >
        {checked ? <Check className="size-3 stroke-[2.8] text-white" /> : null}
      </span>
    </span>
  );
}
