"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import { searchIntegrationApps, type IntegrationAppHit } from "@/lib/actions/integrations";
import { cacheIntegrationIcon } from "@/lib/integrations/icon-resolver";
import { cn } from "@/lib/utils";

function AppMark({ src, name }: { src?: string; name: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <span
        className="flex size-6 shrink-0 items-center justify-center rounded-md bg-brand/15 text-[10px] font-semibold text-brand"
        aria-hidden="true"
      >
        {name.slice(0, 1).toUpperCase()}
      </span>
    );
  }
  return (
    // Pipedream hosts logos off-origin — next/image isn't configured for that domain.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={24}
      height={24}
      className="size-6 shrink-0 rounded-md object-contain"
      onError={() => setFailed(true)}
    />
  );
}

export function AppSearchField({
  value,
  onChange,
  seedQuery,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (appId: string) => void;
  seedQuery?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [apps, setApps] = useState<IntegrationAppHit[]>([]);

  useEffect(() => {
    if (!open) return;
    const q = query.trim() || seedQuery?.trim() || "";
    if (!q) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoading(true);
      void searchIntegrationApps(q, 20)
        .then((result) => {
          if (cancelled) return;
          setApps(result.apps);
          for (const app of result.apps) {
            if (app.imgSrc) cacheIntegrationIcon(app.appId, app.imgSrc);
          }
        })
        .catch(() => {
          if (!cancelled) setApps([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, query, seedQuery]);

  useEffect(() => {
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", onPointer);
    return () => window.removeEventListener("pointerdown", onPointer);
  }, []);

  return (
    <div ref={rootRef} className="relative">
      <Input
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        autoComplete="off"
        spellCheck={false}
        disabled={disabled}
        value={query}
        placeholder={placeholder}
        className="h-10 rounded-xl bg-background/80"
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          const next = event.target.value;
          setQuery(next);
          onChange(next);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setOpen(false);
            return;
          }
          if (event.key === "Enter" && apps[0]) {
            event.preventDefault();
            const hit = apps[0];
            setQuery(hit.name);
            onChange(hit.appId);
            setOpen(false);
          }
        }}
      />
      {open ? (
        <ul
          id={listId}
          role="listbox"
          className={cn(
            "absolute z-50 mt-1.5 max-h-64 w-full overflow-y-auto rounded-2xl border border-border/70",
            "bg-popover p-1.5 shadow-lg",
          )}
        >
          {loading && apps.length === 0 ? (
            <li className="flex items-center gap-2 px-3 py-2.5 text-sm text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              …
            </li>
          ) : null}
          {apps.map((app) => (
            <li key={app.appId} role="option" aria-selected={app.appId === value}>
              <button
                type="button"
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors",
                  "hover:bg-brand/15",
                  app.appId === value && "bg-brand/20",
                )}
                onClick={() => {
                  setQuery(app.name);
                  onChange(app.appId);
                  setOpen(false);
                }}
              >
                <AppMark src={app.imgSrc} name={app.name} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{app.name}</span>
                  {app.summary ? (
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {app.summary}
                    </span>
                  ) : null}
                </span>
              </button>
            </li>
          ))}
          {!loading && apps.length === 0 && (query.trim() || seedQuery) ? (
            <li className="px-3 py-2.5 text-sm text-muted-foreground">{placeholder}</li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
