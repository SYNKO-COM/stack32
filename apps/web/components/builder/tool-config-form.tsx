"use client";

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
  saveToolConfig,
} from "@/lib/actions/integrations";

type FieldSchema = {
  type?: string;
  description?: string;
  enum?: unknown[];
  default?: unknown;
  title?: string;
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
}: {
  agentId: string;
  toolId: string;
  appId?: string;
  onSaved?: () => void;
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
        setValues(next);
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

        const loading: Record<string, boolean> = {};
        for (const [key, fieldMeta] of Object.entries(props)) {
          if (fieldMeta.enum && fieldMeta.enum.length > 0) continue;
          loading[key] = true;
        }
        setLoadingOptions(loading);
        for (const key of Object.keys(loading)) {
          void getToolDynamicOptions({ toolId, prop: key, agentId })
            .then((res) => {
              if (cancelled) return;
              setRemoteOptions((prev) => ({
                ...prev,
                [key]: (res.options ?? []).map((o) => ({
                  value: String(o.value),
                  label: String(o.label ?? o.value),
                })),
              }));
            })
            .finally(() => {
              if (cancelled) return;
              setLoadingOptions((prev) => ({ ...prev, [key]: false }));
            });
        }
      } catch {
        if (!cancelled) setError(t("panel.toolConfigLoadError"));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [agentId, toolId, appId, t]);

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
          required: required.includes(key) || hintKeys.includes(key),
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
            onChange={setConnectionId}
          />
        </div>
      ) : null}

      <PipedreamPropFields
        props={propDefs}
        values={values}
        disabled={pending}
        selectPlaceholder={t("panel.toolConfigSelect")}
        searchPlaceholder={t("panel.toolConfigSearch")}
        onChange={(name, value) => {
          setSaved(false);
          setValues((prev) => ({ ...prev, [name]: value }));
        }}
      />

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
