"use client";

import { useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
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
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState<Record<string, string>>({});
  const [fields, setFields] = useState<Record<string, FieldSchema>>({});
  const [required, setRequired] = useState<string[]>([]);
  const [remoteOptions, setRemoteOptions] = useState<
    Record<string, Array<{ value: string; label: string }>>
  >({});
  const [accounts, setAccounts] = useState<
    Array<{ connectionId: string; accountEmail?: string | null; appId?: string }>
  >([]);
  const [connectionId, setConnectionId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [hintKeys, setHintKeys] = useState<string[]>([]);

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

        // Keep hint keys for required markers only — never surface builder/tech copy in UI.
        const fromHints: string[] = [];
        const hints = Array.isArray(appHint?.required_static_hints)
          ? appHint.required_static_hints
          : [];
        for (const h of hints) {
          if (h && typeof h === "object" && Array.isArray((h as { keys?: unknown }).keys)) {
            for (const k of (h as { keys: unknown[] }).keys) {
              if (typeof k === "string") fromHints.push(k);
            }
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
        setLoaded(true);
        for (const [key, meta] of Object.entries(props)) {
          if (meta.enum && meta.enum.length > 0) continue;
          void getToolDynamicOptions({ toolId, prop: key, agentId }).then((res) => {
            if (cancelled) return;
            setRemoteOptions((prev) => ({
              ...prev,
              [key]: (res.options ?? []).map((o) => ({
                value: String(o.value),
                label: String(o.label ?? o.value),
              })),
            }));
          });
        }
      } catch {
        if (!cancelled) setError("Could not load tool configuration.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [agentId, toolId, appId]);

  if (!loaded && !error) {
    return <p className="text-xs text-muted-foreground">Loading configuration…</p>;
  }

  const hasFields = Object.keys(fields).length > 0;
  const hasAccounts = accounts.length > 0;

  if (!hasFields && !hasAccounts) {
    return (
      <p className="text-xs text-muted-foreground">
        No extra configuration required for this tool.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {hasAccounts ? (
        <label className="block space-y-1 text-xs">
          <span className="font-medium text-foreground">Account</span>
          <select
            className="w-full rounded-md border border-border bg-background px-2 py-1.5"
            value={connectionId}
            onChange={(e) => setConnectionId(e.target.value)}
          >
            <option value="">Select account…</option>
            {accounts.map((a) => (
              <option key={a.connectionId} value={a.connectionId}>
                {a.accountEmail || a.appId || a.connectionId.slice(0, 8)}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {Object.entries(fields).map(([key, meta]) => {
        const options =
          (meta.enum ?? []).map((v) => ({ value: String(v), label: String(v) })) ||
          remoteOptions[key] ||
          [];
        const remote = remoteOptions[key] ?? [];
        const selectOptions = options.length > 0 ? options : remote;
        return (
          <label key={key} className="block space-y-1 text-xs">
            <span className="font-medium text-foreground">
              {key}
              {required.includes(key) || hintKeys.includes(key) ? " *" : ""}
            </span>
            {meta.description ? (
              <span className="block text-muted-foreground">{meta.description}</span>
            ) : null}
            {selectOptions.length > 0 ? (
              <select
                className="w-full rounded-md border border-border bg-background px-2 py-1.5"
                value={values[key] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
              >
                <option value="">Select…</option>
                {selectOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            ) : meta.type === "boolean" ? (
              <input
                type="checkbox"
                checked={values[key] === "true"}
                onChange={(e) =>
                  setValues((v) => ({ ...v, [key]: e.target.checked ? "true" : "false" }))
                }
              />
            ) : (
              <input
                className="w-full rounded-md border border-border bg-background px-2 py-1.5"
                value={values[key] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
              />
            )}
          </label>
        );
      })}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      <Button
        size="sm"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            try {
              const payload: Record<string, unknown> = {};
              for (const [k, v] of Object.entries(values)) {
                if (v === "") continue;
                if (fields[k]?.type === "boolean") payload[k] = v === "true";
                else if (fields[k]?.type === "integer") payload[k] = Number(v);
                else payload[k] = v;
              }
              if (connectionId) {
                await bindIntegrationConnection({
                  agentId,
                  connectionId,
                  toolIds: [toolId],
                });
              }
              await saveToolConfig(
                agentId,
                toolId,
                payload,
                connectionId || undefined,
              );
              onSaved?.();
            } catch {
              setError("Could not save configuration.");
            }
          });
        }}
      >
        {pending ? "Saving…" : "Save configuration"}
      </Button>
    </div>
  );
}
