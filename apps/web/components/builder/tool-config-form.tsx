"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";

import {
  PipedreamPropFields,
  type PipedreamPropDef,
} from "@/components/builder/pipedream-prop-fields";
import { Button } from "@/components/ui/button";
import { DaSelect } from "@/components/ui/da-select";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/hooks/use-translation";
import {
  bindIntegrationConnection,
  getToolConfig,
  getToolDynamicOptions,
  listIntegrationAccounts,
  reloadToolProps,
  saveToolConfig,
} from "@/lib/actions/integrations";
import {
  isPropValueFilled,
  isStructureRequiredProp,
  resolvePropCopy,
} from "@/lib/integrations/prop-labels";
import { cn } from "@/lib/utils";

type FieldSchema = {
  type?: string;
  description?: string;
  enum?: unknown[];
  default?: unknown;
  title?: string;
  "x-reload-props"?: boolean;
  "x-remote-options"?: boolean;
};

type HintRow = {
  keys?: string[];
  label?: string;
  why?: string;
};

export function ToolConfigForm({
  agentId,
  toolId,
  appId,
  onSaved,
  refreshKey = 0,
}: {
  agentId: string;
  toolId: string;
  appId?: string;
  onSaved?: () => void;
  /**
   * Bump when an account was just connected: the schema, the account list and
   * the remote options reload in place. The plain-text calendar field becomes
   * the real picker the moment Pipedream knows the account — no page refresh,
   * and the open panel stays open.
   */
  refreshKey?: number;
}) {
  const { t } = useTranslation("structure");
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState<Record<string, string>>({});
  const [fields, setFields] = useState<Record<string, FieldSchema>>({});
  const [required, setRequired] = useState<string[]>([]);
  const [remoteOptions, setRemoteOptions] = useState<
    Record<string, Array<{ value: string; label: string }>>
  >({});
  const [loadingOptions, setLoadingOptions] = useState<Record<string, boolean>>({});
  const [accounts, setAccounts] = useState<
    Array<{ connectionId: string; accountEmail?: string | null; appId?: string }>
  >([]);
  const [connectionId, setConnectionId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [hintMeta, setHintMeta] = useState<Record<string, { label?: string; why?: string }>>(
    {},
  );
  const [hintKeys, setHintKeys] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [reloadTriggers, setReloadTriggers] = useState<Set<string>>(new Set());
  const [reloadingProps, setReloadingProps] = useState(false);

  const loadRemoteOptionsForKeys = (
    keys: string[],
    cancelled: () => boolean,
    propsMap?: Record<string, FieldSchema>,
    draft?: Record<string, string>,
  ) => {
    const map = propsMap ?? fields;
    const loading: Record<string, boolean> = {};
    for (const key of keys) {
      const fieldMeta = map[key];
      if (fieldMeta?.enum && fieldMeta.enum.length > 0) continue;
      loading[key] = true;
    }
    if (Object.keys(loading).length === 0) return;
    setLoadingOptions((prev) => ({ ...prev, ...loading }));
    for (const key of Object.keys(loading)) {
      void getToolDynamicOptions({ toolId, prop: key, agentId, draft })
        .then((res) => {
          if (cancelled()) return;
          setRemoteOptions((prev) => ({
            ...prev,
            [key]: (res.options ?? []).map((o) => ({
              value: String(o.value),
              label: String(o.label ?? o.value),
            })),
          }));
        })
        .finally(() => {
          if (cancelled()) return;
          setLoadingOptions((prev) => ({ ...prev, [key]: false }));
        });
    }
  };

  const applyStaticSchema = (
    staticSchema: Record<string, unknown> | undefined,
    existingValues: Record<string, string>,
  ) => {
    const props =
      (staticSchema?.properties as Record<string, FieldSchema> | undefined) ?? {};
    setFields(props);
    setRequired(
      Array.isArray(staticSchema?.required) ? (staticSchema.required as string[]) : [],
    );
    setValues((prev) => {
      const next = { ...prev, ...existingValues };
      for (const key of Object.keys(props)) {
        if (next[key] === undefined) next[key] = "";
      }
      return next;
    });
    return Object.keys(props);
  };

  const handlePropChange = (name: string, value: string) => {
    setSaved(false);
    const nextValues = { ...values, [name]: value };
    setValues(nextValues);

    // A choice can unlock its dependants: Pipedream lists a board's lists only
    // once it knows the board. Refresh the other pickers with the choice in
    // hand, or they stay empty text boxes asking for an id.
    if (value.trim()) {
      const dependants = Object.keys(fields).filter((k) => k !== name);
      if (dependants.length > 0) {
        loadRemoteOptionsForKeys(dependants, () => false, fields, nextValues);
      }
    }

    if (!reloadTriggers.has(name) || !value.trim()) return;

    void (async () => {
      setReloadingProps(true);
      setError(null);
      try {
        const configPayload: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(nextValues)) {
          if (v === "" || k.startsWith("_")) continue;
          configPayload[k] = v;
        }
        const res = await reloadToolProps({
          toolId,
          agentId,
          config: configPayload,
          connectionId: connectionId || undefined,
          changedProp: name,
        });
        if (res.error) {
          setError(
            typeof res.message === "string"
              ? res.message
              : "Impossible de charger les options suivantes.",
          );
          return;
        }
        const dynId = res.dynamic_props_id;
        const mergedValues = { ...nextValues };
        if (typeof dynId === "string" && dynId) {
          mergedValues._dynamicPropsId = dynId;
        }
        const newKeys = applyStaticSchema(
          res.static_schema as Record<string, unknown> | undefined,
          mergedValues,
        );
        const triggers = Array.isArray(res.reload_props_triggers)
          ? res.reload_props_triggers.filter((t): t is string => typeof t === "string")
          : [];
        if (triggers.length > 0) {
          setReloadTriggers(new Set(triggers));
        }
        loadRemoteOptionsForKeys(newKeys, () => false);
      } catch {
        setError("Impossible de charger les options suivantes.");
      } finally {
        setReloadingProps(false);
      }
    })();
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [{ config, schema, appHint, playbooks }, listed] = await Promise.all([
          getToolConfig(agentId, toolId),
          listIntegrationAccounts(appId),
        ]);
        if (cancelled) return;
        const staticSchema =
          schema && typeof schema === "object"
            ? (schema.static_schema as Record<string, unknown> | undefined)
            : undefined;
        const props =
          (staticSchema?.properties as Record<string, FieldSchema> | undefined) ?? {};
        setFields(props);
        setRequired(
          Array.isArray(staticSchema?.required)
            ? (staticSchema?.required as string[])
            : [],
        );
        const existing =
          config && typeof config === "object" && config.config && typeof config.config === "object"
            ? (config.config as Record<string, unknown>)
            : config && typeof config === "object"
              ? (config as Record<string, unknown>)
              : {};
        const next: Record<string, string> = {};
        for (const key of Object.keys(props)) {
          const v = existing[key];
          next[key] = v == null ? "" : String(v);
        }
        const dyn =
          existing._dynamicPropsId ?? existing._dynamic_props_id ?? existing.dynamic_props_id;
        if (dyn != null && String(dyn)) {
          next._dynamicPropsId = String(dyn);
        }
        // A reload after connecting must not eat what the person already
        // typed: their unsaved entries win over an empty stored value.
        setValues((prev) => {
          const merged = { ...next };
          for (const [key, value] of Object.entries(prev)) {
            if (value !== "" && (merged[key] === "" || merged[key] === undefined)) {
              merged[key] = value;
            }
          }
          return merged;
        });
        const triggersRaw =
          schema && typeof schema === "object"
            ? (schema as { reload_props_triggers?: unknown }).reload_props_triggers
            : [];
        const triggers = Array.isArray(triggersRaw)
          ? triggersRaw.filter((x): x is string => typeof x === "string")
          : [];
        for (const [key, meta] of Object.entries(props)) {
          if (meta?.["x-reload-props"]) triggers.push(key);
        }
        setReloadTriggers(new Set(triggers));
        const acctRows = listed.accounts ?? [];
        setAccounts(acctRows);
        const storedConn =
          config && typeof config === "object" && typeof config.connection_id === "string"
            ? config.connection_id
            : "";
        setConnectionId(storedConn || acctRows[0]?.connectionId || "");

        const fromHints: string[] = [];
        const meta: Record<string, { label?: string; why?: string }> = {};
        const hints = Array.isArray(appHint?.required_static_hints)
          ? (appHint.required_static_hints as HintRow[])
          : [];
        for (const h of hints) {
          if (!h || typeof h !== "object" || !Array.isArray(h.keys)) continue;
          for (const k of h.keys) {
            if (typeof k !== "string") continue;
            fromHints.push(k);
            meta[k] = {
              label: typeof h.label === "string" ? h.label : undefined,
              why: typeof h.why === "string" ? h.why : undefined,
            };
          }
        }
        for (const pb of playbooks) {
          const shape = pb.config_shape;
          if (shape && typeof shape === "object") {
            for (const k of Object.keys(shape as Record<string, unknown>)) {
              if (!k.startsWith("_")) fromHints.push(k);
            }
          }
        }
        setHintKeys([...new Set(fromHints)]);
        setHintMeta(meta);
        setLoaded(true);

        loadRemoteOptionsForKeys(Object.keys(props), () => cancelled, props);
      } catch {
        if (!cancelled) setError(t("panel.toolConfigLoadError"));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [agentId, toolId, appId, refreshKey, t]);

  const orderedProps = useMemo(() => {
    const keys = Object.keys(fields);
    const score = (key: string) => {
      if (required.includes(key)) return 0;
      if (hintKeys.includes(key)) return 1;
      return 2;
    };
    return [...keys].sort((a, b) => score(a) - score(b) || a.localeCompare(b));
  }, [fields, required, hintKeys]);

  const propDefs: PipedreamPropDef[] = useMemo(
    () =>
      orderedProps.map((key) => {
        const meta = fields[key] ?? {};
        return {
          name: key,
          label: typeof meta.title === "string" ? meta.title : undefined,
          type: meta.type,
          required:
            required.includes(key) ||
            hintKeys.includes(key) ||
            isStructureRequiredProp({
              name: key,
              required: required.includes(key),
            }),
          description: meta.description,
          enum: meta.enum,
          options: remoteOptions[key],
          optionsLoading: Boolean(loadingOptions[key]),
          hintLabel: hintMeta[key]?.label,
          hintWhy: hintMeta[key]?.why,
        };
      }),
    [
      orderedProps,
      fields,
      required,
      hintKeys,
      remoteOptions,
      loadingOptions,
      hintMeta,
    ],
  );

  const requiredPropDefs = propDefs.filter((p) => isStructureRequiredProp(p));
  const optionalPropDefs = propDefs.filter((p) => !isStructureRequiredProp(p));

  if (!loaded && !error) {
    return <p className="text-xs text-muted-foreground">{t("panel.toolConfigLoading")}</p>;
  }

  const hasFields = propDefs.length > 0;
  const hasAccounts = accounts.length > 0;

  if (!hasFields && !hasAccounts) {
    return (
      <p className="text-xs text-muted-foreground">{t("panel.toolConfigEmpty")}</p>
    );
  }

  return (
    <div className="space-y-4">
      {hasAccounts ? (
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">{t("panel.toolConfigAccount")}</Label>
          <p className="text-[11px] text-muted-foreground">
            {t("panel.toolConfigAccountHint")}
          </p>
          <DaSelect
            value={connectionId}
            searchable={accounts.length > 4}
            placeholder={t("panel.toolConfigAccountPlaceholder")}
            options={accounts.map((a) => ({
              value: a.connectionId,
              label: a.accountEmail || a.appId || a.connectionId.slice(0, 8),
            }))}
            onChange={(next) => {
              setConnectionId(next);
              if (!next) return;
              // Bind on the spot. The account used to be attached only by
              // Enregistrer, which needs the required fields — and those are
              // pickers that stay empty until an account is bound, because
              // Pipedream cannot list someone's boards without one. Choosing
              // the account was the only way out of that circle, so it does
              // the binding, and the pickers fill in straight after.
              void bindIntegrationConnection({
                agentId,
                connectionId: next,
                toolIds: [toolId],
              })
                .then(() => loadRemoteOptionsForKeys(Object.keys(fields), () => false))
                .catch(() => setError(t("panel.toolConfigSaveError")));
            }}
          />
        </div>
      ) : null}

      {requiredPropDefs.length > 0 ? (
        <PipedreamPropFields
          props={requiredPropDefs}
          values={values}
          disabled={pending || reloadingProps}
          selectPlaceholder={t("panel.toolConfigSelect")}
          searchPlaceholder={t("panel.toolConfigSearch")}
          onChange={handlePropChange}
        />
      ) : null}

      {reloadingProps ? (
        <p className="text-xs text-muted-foreground">Chargement des options…</p>
      ) : null}

      {optionalPropDefs.length > 0 ? (
        <div className="space-y-2">
          <button
            type="button"
            className="group flex w-full items-center gap-1.5 py-0.5 text-left text-[11px] text-muted-foreground/70 transition-colors hover:text-muted-foreground"
            onClick={() => setAdvancedOpen((open) => !open)}
            aria-expanded={advancedOpen}
          >
            <span>{t("panel.toolTriggerAdvanced")}</span>
            <ChevronDown
              className={cn(
                "size-3.5 opacity-70 transition-transform",
                advancedOpen && "rotate-180",
              )}
              aria-hidden="true"
            />
          </button>
          {advancedOpen ? (
            <div className="rounded-2xl border border-border/40 bg-muted/20 p-3">
              <PipedreamPropFields
                props={optionalPropDefs}
                values={values}
                disabled={pending || reloadingProps}
                selectPlaceholder={t("panel.toolConfigSelect")}
                searchPlaceholder={t("panel.toolConfigSearch")}
                onChange={handlePropChange}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {saved ? (
        <p className="text-sm text-emerald-700 dark:text-emerald-300">{t("panel.saved")}</p>
      ) : null}

      <Button
        type="button"
        disabled={pending}
        onClick={() => {
          setError(null);
          setSaved(false);
          const missing = requiredPropDefs.filter(
            (prop) => !isPropValueFilled(values[prop.name]),
          );
          if (missing.length > 0) {
            const labels = missing
              .slice(0, 3)
              .map((prop) =>
                resolvePropCopy(prop.name, {
                  label: prop.label,
                  hintLabel: prop.hintLabel,
                }).label,
              );
            setError(
              t("panel.toolTriggerMissingFields", {
                fields: labels.join(", "),
                defaultValue: `Renseignez : ${labels.join(", ")}`,
              }),
            );
            return;
          }
          startTransition(async () => {
            try {
              const payload: Record<string, unknown> = {};
              for (const [k, v] of Object.entries(values)) {
                if (v === "") continue;
                if (fields[k]?.type === "boolean") payload[k] = v === "true";
                else if (fields[k]?.type === "integer" || fields[k]?.type === "number") {
                  payload[k] = Number(v);
                } else payload[k] = v;
              }
              if (connectionId) {
                await bindIntegrationConnection({
                  agentId,
                  connectionId,
                  toolIds: [toolId],
                });
              }
              await saveToolConfig(agentId, toolId, payload, connectionId || undefined);
              setSaved(true);
              onSaved?.();
            } catch {
              setError(t("panel.toolConfigSaveError"));
            }
          });
        }}
      >
        {pending ? t("panel.saving") : t("panel.save")}
      </Button>
    </div>
  );
}
