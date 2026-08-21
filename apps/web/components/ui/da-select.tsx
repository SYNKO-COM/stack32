"use client";

import { Check, ChevronDown, Search } from "lucide-react";
import { useMemo, useState } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type DaSelectOption = {
  value: string;
  label: string;
};

export function DaSelect({
  value,
  options,
  onChange,
  placeholder,
  disabled,
  className,
  id,
  searchable = false,
  searchPlaceholder,
}: {
  value: string;
  options: DaSelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
  /** Show a filter field when the list is long (remote options). */
  searchable?: boolean;
  searchPlaceholder?: string;
}) {
  const [query, setQuery] = useState("");
  const selected = options.find((option) => option.value === value);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (option) =>
        option.label.toLowerCase().includes(q) ||
        option.value.toLowerCase().includes(q),
    );
  }, [options, query]);
  const enableSearch = searchable || options.length > 8;

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (!open) setQuery("");
      }}
    >
      <DropdownMenuTrigger
        id={id}
        disabled={disabled}
        className={cn(
          "flex h-10 w-full items-center justify-between gap-2 rounded-xl border border-border/70 bg-background/80 px-3 text-left text-sm outline-none transition-colors",
          "hover:border-border focus-visible:ring-2 focus-visible:ring-brand/40",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
      >
        <span className={cn("truncate", !selected && "text-muted-foreground")}>
          {selected?.label ?? placeholder ?? ""}
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="max-h-72 w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto rounded-2xl border-border/70 p-1.5"
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        {enableSearch ? (
          <div className="sticky top-0 z-[1] mb-1 bg-popover px-1 pb-1 pt-0.5">
            <label className="relative block">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={searchPlaceholder || "Rechercher…"}
                className="h-9 w-full rounded-xl border border-border/60 bg-background pl-8 pr-3 text-sm outline-none focus:ring-2 focus:ring-brand/30"
                onKeyDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
              />
            </label>
          </div>
        ) : null}
        {filtered.length === 0 ? (
          <p className="px-3 py-2 text-sm text-muted-foreground">Aucun résultat</p>
        ) : (
          filtered.map((option) => (
            <DropdownMenuItem
              key={option.value}
              className={cn(
                "cursor-pointer rounded-xl px-3 py-2.5 text-sm",
                option.value === value && "bg-brand/20 text-foreground focus:bg-brand/25",
              )}
              onSelect={() => onChange(option.value)}
            >
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
              {option.value === value ? (
                <Check className="size-3.5 shrink-0 text-brand" aria-hidden="true" />
              ) : null}
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
