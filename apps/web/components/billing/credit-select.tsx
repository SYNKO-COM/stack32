"use client";

import { ChevronDown } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type CreditSelectProps = {
  value: number;
  options: number[];
  onChange: (credits: number) => void;
  formatLabel: (credits: number) => string;
  needMoreLabel: string;
  onNeedMore?: () => void;
  className?: string;
  disabled?: boolean;
};

export function CreditSelect({
  value,
  options,
  onChange,
  formatLabel,
  needMoreLabel,
  onNeedMore,
  className,
  disabled,
}: CreditSelectProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={disabled}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-xl border border-border/70 bg-background/80 px-3 py-2.5 text-left text-sm outline-none transition-colors",
          "hover:border-border focus-visible:ring-2 focus-visible:ring-brand/40",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
      >
        <span>{formatLabel(value)}</span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="max-h-72 w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto rounded-2xl border-border/70 p-1.5"
      >
        {options.map((credits) => (
          <DropdownMenuItem
            key={credits}
            className={cn(
              "cursor-pointer rounded-xl px-3 py-2.5 text-sm",
              credits === value && "bg-brand/20 text-foreground focus:bg-brand/25",
            )}
            onSelect={() => onChange(credits)}
          >
            {formatLabel(credits)}
          </DropdownMenuItem>
        ))}
        {onNeedMore ? (
          <>
            <DropdownMenuSeparator className="my-1.5" />
            <DropdownMenuItem
              className="cursor-pointer rounded-xl px-3 py-2.5 text-sm text-muted-foreground"
              onSelect={onNeedMore}
            >
              {needMoreLabel}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
