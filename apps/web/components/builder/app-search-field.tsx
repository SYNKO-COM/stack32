"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Input } from "@/components/ui/input";
import { searchIntegrationApps, type IntegrationAppHit } from "@/lib/actions/integrations";
import { cacheIntegrationIcon } from "@/lib/integrations/icon-resolver";
import { rankIntegrationApps } from "@/lib/integrations/rank-apps";
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
  const listRef = useRef<HTMLUListElement>(null);
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [apps, setApps] = useState<IntegrationAppHit[]>([]);
  const [menuBox, setMenuBox] = useState<{ top: number; left: number; width: number } | null>(
    null,
  );

  useEffect(() => {
    if (!open) return;
    const q = query.trim() || seedQuery?.trim() || "";
    if (!q) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoading(true);
      void searchIntegrationApps(q, 40)
        .then((result) => {
          if (cancelled) return;
          const ranked = rankIntegrationApps(q, result.apps);
          // #region agent log
          fetch('http://127.0.0.1:7857/ingest/1ac9df66-3a30-4b3a-a8c1-bbbdaf39db81',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'faa28e'},body:JSON.stringify({sessionId:'faa28e',runId:'pre-verify',hypothesisId:'A,C,D',location:'app-search-field.tsx:search',message:'app search ranked',data:{q,rawIds:result.apps.slice(0,8).map((a)=>a.appId),rawNames:result.apps.slice(0,8).map((a)=>a.name),rankedIds:ranked.slice(0,8).map((a)=>a.appId),rankedNames:ranked.slice(0,8).map((a)=>a.name),rawCount:result.apps.length,rankedCount:ranked.length,googleInRaw:result.apps.some((a)=>a.appId==='google'),gmailInRaw:result.apps.some((a)=>a.appId==='gmail'),gmailFirst:ranked[0]?.appId==='gmail'},timestamp:Date.now()})}).catch(()=>{});
          // #endregion
          setApps(ranked);
          for (const app of ranked) {
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

  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const el = rootRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setMenuBox({
        top: rect.bottom + 6,
        left: rect.left,
        width: rect.width,
      });
    };
    update();
    // #region agent log
    const rect = rootRef.current?.getBoundingClientRect();
    let bubbleOverflow: string | null = null;
    let node: HTMLElement | null = rootRef.current;
    while (node) {
      const ov = window.getComputedStyle(node).overflow;
      if (ov && ov !== "visible") {
        bubbleOverflow = `${node.className?.toString().slice(0, 80)}:${ov}`;
        break;
      }
      node = node.parentElement;
    }
    fetch('http://127.0.0.1:7857/ingest/1ac9df66-3a30-4b3a-a8c1-bbbdaf39db81',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'faa28e'},body:JSON.stringify({sessionId:'faa28e',runId:'pre-verify',hypothesisId:'B,E',location:'app-search-field.tsx:portal',message:'autocomplete portal layout',data:{open,usingPortal:true,hasMenuBox:true,top:rect?rect.bottom+6:null,width:rect?.width??null,clippingAncestor:bubbleOverflow,listParent:'document.body'},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, apps.length]);

  useEffect(() => {
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || listRef.current?.contains(target)) return;
      setOpen(false);
    };
    window.addEventListener("pointerdown", onPointer);
    return () => window.removeEventListener("pointerdown", onPointer);
  }, []);

  const menu =
    open && menuBox && typeof document !== "undefined"
      ? createPortal(
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            style={{ top: menuBox.top, left: menuBox.left, width: menuBox.width }}
            className={cn(
              "fixed z-[80] max-h-72 overflow-y-auto rounded-2xl border border-border/70",
              "bg-popover p-1.5 shadow-xl",
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
          </ul>,
          document.body,
        )
      : null;

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
      {menu}
    </div>
  );
}
