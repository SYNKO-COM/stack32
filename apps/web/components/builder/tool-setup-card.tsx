"use client";

import { useMemo } from "react";

import {
  IntegrationConnectionCard,
  type IntegrationConnectionStatus,
} from "@/components/builder/integration-connection-card";
import type { ApprovalMode, BuilderUiComponent } from "@/lib/domain/types";
import { useTranslation } from "@/hooks/use-translation";
import { cn } from "@/lib/utils";

function fieldValue(fields: BuilderUiComponent["fields"], key: string): string {
  return fields.find((f) => f.key === key)?.suggested_value ?? "";
}

function normalizeApprovalMode(raw: string): ApprovalMode {
  if (raw === "always" || raw === "conditional" || raw === "never") return raw;
  return "never";
}

export interface ToolSetupCardProps {
  agentId: string;
  uiComponent?: BuilderUiComponent;
  toolId?: string;
  provider?: string;
  appId?: string;
  approvalMode?: ApprovalMode | string;
  connectionStatus?: IntegrationConnectionStatus;
  accountEmail?: string;
  connectionId?: string;
  toolIds?: string[];
  onConnected?: () => void;
  className?: string;
}

export function ToolSetupCard({
  agentId,
  uiComponent,
  toolId: toolIdProp,
  provider: providerProp,
  appId: appIdProp,
  approvalMode: approvalModeProp,
  connectionStatus,
  accountEmail,
  connectionId,
  toolIds: toolIdsProp,
  onConnected,
  className,
}: ToolSetupCardProps) {
  const { t } = useTranslation(["builder", "structure"]);

  const fields = uiComponent?.fields ?? [];
  const toolId = toolIdProp || fieldValue(fields, "tool_id") || fieldValue(fields, "toolId");
  const provider =
    providerProp ||
    fieldValue(fields, "provider") ||
    (toolId.startsWith("gmail_") || toolId.startsWith("calendar_") ? "google" : "pipedream");
  const appId = appIdProp || fieldValue(fields, "app_id") || fieldValue(fields, "appId") || undefined;
  const approvalMode = normalizeApprovalMode(
    approvalModeProp || fieldValue(fields, "approval_mode") || fieldValue(fields, "approvalMode") || "never",
  );
  const toolIds = useMemo(() => {
    if (toolIdsProp?.length) return toolIdsProp;
    return toolId ? [toolId] : undefined;
  }, [toolId, toolIdsProp]);

  const approvalLabel = t(`connections.approvalModes.${approvalMode}`, {
    defaultValue: approvalMode,
  });

  return (
    <div className={cn("space-y-3", className)}>
      <div className="rounded-xl border border-border p-4 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-medium">
              {t("connections.toolSetupTitle", { defaultValue: "Tool setup" })}
            </h3>
            {toolId ? (
              <p className="mt-1 font-mono text-xs text-muted-foreground truncate">{toolId}</p>
            ) : null}
          </div>
          <span className="shrink-0 rounded-full bg-foreground/[0.05] px-2 py-0.5 text-[11px] text-muted-foreground">
            {approvalLabel}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          {t("connections.approvalHint", {
            defaultValue: "Approval mode controls when the agent asks before running this tool.",
          })}
        </p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          <dt className="text-muted-foreground">
            {t("connections.approvalMode", { defaultValue: "Approval" })}
          </dt>
          <dd className="font-medium">{approvalLabel}</dd>
          <dt className="text-muted-foreground">
            {t("connections.connectionStatus", { defaultValue: "Connection" })}
          </dt>
          <dd className="font-medium">
            {connectionStatus === "connected"
              ? t("connections.connected", { defaultValue: "Connected" })
              : t("connections.needsSetup", { defaultValue: "Needs setup" })}
          </dd>
        </dl>
      </div>

      <IntegrationConnectionCard
        provider={provider}
        appId={appId}
        agentId={agentId}
        toolIds={toolIds}
        status={connectionStatus ?? "needs_setup"}
        accountEmail={accountEmail}
        connectionId={connectionId}
        onConnected={onConnected}
      />
    </div>
  );
}
