"use client";

import { Loader2, RefreshCw } from "lucide-react";

import { DaSelect, type DaSelectOption } from "@/components/ui/da-select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RoundCheck } from "@/components/ui/round-check";
import { resolvePropCopy } from "@/lib/integrations/prop-labels";
import { cn } from "@/lib/utils";

export type PipedreamPropDef = {
  name: string;
  label?: string;
  type?: string;
  required?: boolean;
  description?: string;
  enum?: unknown[];
  /** Preloaded options (enum or remote). */
  options?: DaSelectOption[];
  /** Remote options still loading. */
  optionsLoading?: boolean;
  /** The choices live in the connected account (x-remote-options). Such a
   * field is never a plain text box: an id typed by hand is exactly what the
   * agent cannot resolve. Empty choices show a reload state instead. */
  remoteOptions?: boolean;
  hintLabel?: string;
  hintWhy?: string;
};

export function PipedreamPropFields({
  props,
  values,
  onChange,
  disabled,
  className,
  selectPlaceholder,
  searchPlaceholder,
  onRetryOptions,
}: {
  props: PipedreamPropDef[];
  values: Record<string, string>;
  onChange: (name: string, value: string) => void;
  disabled?: boolean;
  className?: string;
  selectPlaceholder?: string;
  searchPlaceholder?: string;
  /** Reload the remote choices of one field (empty answer, flaky network…). */
  onRetryOptions?: (name: string) => void;
}) {
  if (props.length === 0) return null;

  return (
    <div className={cn("space-y-3.5", className)}>
      {props.map((prop) => {
        const copy = resolvePropCopy(prop.name, {
          label: prop.label,
          description: prop.description,
          hintLabel: prop.hintLabel,
          hintWhy: prop.hintWhy,
        });
        const enumOpts = (prop.enum ?? []).map((v) => ({
          value: String(v),
          label: String(v),
        }));
        const selectOptions =
          enumOpts.length > 0 ? enumOpts : (prop.options ?? []);
        const                       isBool =
          prop.type === "boolean" || prop.type === "bool";
        const isNumber =
          prop.type === "integer" ||
          prop.type === "number" ||
          prop.type === "int";

        return (
          <div key={prop.name} className="space-y-1.5">
            {isBool && selectOptions.length === 0 ? (
              <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-border/60 bg-background/60 px-3 py-3">
                <RoundCheck
                  checked={values[prop.name] === "true"}
                  disabled={disabled}
                  onChange={(checked) =>
                    onChange(prop.name, checked ? "true" : "false")
                  }
                />
                <span className="min-w-0 space-y-0.5">
                  <span className="block text-sm font-medium text-foreground">
                    {copy.label}
                    {prop.required ? " *" : ""}
                  </span>
                  {copy.hint ? (
                    <span className="block text-xs leading-relaxed text-muted-foreground">
                      {copy.hint}
                    </span>
                  ) : null}
                </span>
              </label>
            ) : (
              <>
                <Label htmlFor={`pd-prop-${prop.name}`} className="text-xs font-medium">
                  {copy.label}
                  {prop.required ? " *" : ""}
                </Label>
                {copy.hint ? (
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    {copy.hint}
                  </p>
                ) : null}
                {prop.optionsLoading && selectOptions.length === 0 ? (
                  <p className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                    Chargement des choix…
                  </p>
                ) : prop.remoteOptions && selectOptions.length === 0 ? (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onRetryOptions?.(prop.name)}
                    className="flex h-10 w-full items-center justify-between rounded-xl border border-input bg-background/80 px-3 text-left text-sm text-muted-foreground transition hover:border-ring disabled:opacity-50"
                  >
                    <span>Aucun choix reçu du compte — recharger</span>
                    <RefreshCw className="size-3.5 shrink-0" aria-hidden="true" />
                  </button>
                ) : selectOptions.length > 0 ? (
                  <DaSelect
                    id={`pd-prop-${prop.name}`}
                    value={values[prop.name] ?? ""}
                    options={selectOptions}
                    disabled={disabled}
                    searchable
                    searchPlaceholder={searchPlaceholder}
                    placeholder={selectPlaceholder || "Choisir…"}
                    onChange={(next) => onChange(prop.name, next)}
                  />
                ) : (
                  <Input
                    id={`pd-prop-${prop.name}`}
                    type={isNumber ? "number" : "text"}
                    disabled={disabled}
                    value={values[prop.name] ?? ""}
                    onChange={(event) => onChange(prop.name, event.target.value)}
                    placeholder={copy.hint ? undefined : copy.label}
                    className="h-10 rounded-xl bg-background/80"
                  />
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
