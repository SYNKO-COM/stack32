"use client";

import { IntegrationConnectionCard } from "@/components/builder/integration-connection-card";
import { ToolConfigForm } from "@/components/builder/tool-config-form";
import { ModelConfigForm } from "@/components/builder/agent-structure/drawers/model-config-form";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { useTranslation } from "@/hooks/use-translation";
import type { ProductNode } from "@/lib/domain/product-agent-graph";
import type { ApprovalMode } from "@/lib/domain/types";

import type { ReactNode } from "react";

import type { AgentConnectionInfo, AgentBindingInfo } from "@/components/builder/agent-module-graph";

function resolveConnection(
  node: ProductNode,
  connections: AgentConnectionInfo[],
  bindings: AgentBindingInfo[],
) {
  const toolIds = node.integration?.toolIds ?? [];
  const binding = bindings.find(
    (b) => b.enabled && b.tool_ids.some((id) => toolIds.includes(id)),
  );
  const connection = connections.find((c) => c.id === binding?.connection_id);
  return { connection, toolIds: binding?.tool_ids ?? toolIds };
}

function FloatingPanel({
  open,
  onOpenChange,
  title,
  subtitle,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        style={{
          top: "1rem",
          right: "1rem",
          bottom: "1rem",
          left: "auto",
          transform: "none",
          width: "min(440px, calc(100% - 2rem))",
          maxWidth: "440px",
          height: "calc(100vh - 2rem)",
          maxHeight: "calc(100vh - 2rem)",
        }}
        className="flex translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-3xl border bg-background p-0 shadow-2xl duration-300 data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-right-10 data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-right-10 sm:max-w-[440px]"
      >
        <DialogHeader className="shrink-0 space-y-1 px-6 pb-4 pt-6 text-left">
          <DialogTitle className="text-xl">{title}</DialogTitle>
          <DialogDescription>{subtitle}</DialogDescription>
        </DialogHeader>
        <Separator />
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">{children}</div>
      </DialogContent>
    </Dialog>
  );
}

export function IntegrationDrawer({
  open,
  onOpenChange,
  node,
  agentId,
  connections,
  bindings,
  toolApprovals,
  onConnectionsChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  node: ProductNode | null;
  agentId: string;
  connections: AgentConnectionInfo[];
  bindings: AgentBindingInfo[];
  toolApprovals?: Record<string, ApprovalMode | string>;
  onConnectionsChanged?: () => void;
}) {
  const { t } = useTranslation(["structure", "builder"]);
  if (!node?.integration) return null;

  const { connection, toolIds } = resolveConnection(node, connections, bindings);
  const connected =
    node.configurationStatus === "ready" || node.integration.connectionStatus === "connected";

  return (
    <FloatingPanel
      open={open}
      onOpenChange={onOpenChange}
      title={node.label}
      subtitle={t("structure:modules.kinds.tool")}
    >
      <div className="rounded-2xl border border-border/60 bg-foreground/[0.02] p-4">
        <p className="mb-3 text-sm font-medium">
          {t("structure:product.capabilities", { defaultValue: "Capabilities" })}
        </p>
        <ul className="space-y-2 text-sm">
          {node.integration.actions.map((action) => (
            <li key={action.toolId} className="flex items-center justify-between gap-2">
              <span>{action.label}</span>
              {toolApprovals?.[action.toolId] ? (
                <span className="text-xs text-muted-foreground">
                  {String(toolApprovals[action.toolId])}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </div>

      {node.integration.provider !== "native" ? (
        <IntegrationConnectionCard
          provider={node.integration.provider}
          appId={node.integration.appKey}
          agentId={agentId}
          toolIds={toolIds}
          status={
            connected
              ? "connected"
              : node.configurationStatus === "broken"
                ? "error"
                : "needs_setup"
          }
          accountEmail={connection?.account_email}
          connectionId={connection?.id}
          onConnected={onConnectionsChanged}
          onChanged={onConnectionsChanged}
        />
      ) : (
        <p className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] px-4 py-3 text-sm text-emerald-900 dark:text-emerald-200">
          {t("structure:modules.readiness.nativeReady")}
        </p>
      )}

      {toolIds[0] ? (
        <div className="rounded-2xl border border-border/50 p-3">
          <ToolConfigForm
            agentId={agentId}
            toolId={toolIds[0]}
            appId={node.integration.appKey}
            onSaved={onConnectionsChanged}
          />
        </div>
      ) : null}
    </FloatingPanel>
  );
}

export function AgentDrawer({
  open,
  onOpenChange,
  node,
  modelSubtitle,
  integrationCount,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  node: ProductNode | null;
  modelSubtitle?: string;
  integrationCount: number;
}) {
  const { t } = useTranslation("structure");
  if (!node) return null;

  return (
    <FloatingPanel
      open={open}
      onOpenChange={onOpenChange}
      title={node.agentName || node.label}
      subtitle={t("panel.agentSubtitle")}
    >
      <dl className="space-y-3 rounded-2xl border border-border/60 p-4 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">{t("modules.kinds.model")}</dt>
          <dd className="font-medium">{modelSubtitle || "—"}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">{t("sections.tools")}</dt>
          <dd className="font-medium">{integrationCount}</dd>
        </div>
      </dl>
    </FloatingPanel>
  );
}

export function TriggerDrawer({
  open,
  onOpenChange,
  node,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  node: ProductNode | null;
}) {
  const { t } = useTranslation("structure");
  if (!node) return null;

  return (
    <FloatingPanel
      open={open}
      onOpenChange={onOpenChange}
      title={node.label}
      subtitle={t("modules.kinds.trigger")}
    >
      <p className="text-sm text-muted-foreground">
        {node.kind === "trigger_schedule"
          ? node.subtitle || t("product.scheduleDefault", { defaultValue: "Runs on a schedule." })
          : t("modules.help.trigger")}
      </p>
    </FloatingPanel>
  );
}

export function GenericDrawer({
  open,
  onOpenChange,
  node,
  agentId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  node: ProductNode | null;
  agentId: string;
  onSaved?: () => void;
}) {
  const { t } = useTranslation("structure");
  if (!node) return null;

  const isModel = node.kind === "model";
  const subtitle = isModel
    ? t("panel.modelSubtitle")
    : node.kind === "memory"
      ? t("panel.memorySubtitle")
      : t("panel.outputSubtitle");

  return (
    <FloatingPanel
      open={open}
      onOpenChange={onOpenChange}
      title={isModel ? t("panel.modelTitle") : node.label}
      subtitle={subtitle}
    >
      {isModel ? (
        <ModelConfigForm agentId={agentId} node={node} onSaved={onSaved} />
      ) : (
        <p className="text-sm text-muted-foreground">
          {t(`modules.help.${node.kind === "output" ? "output" : node.kind}`)}
        </p>
      )}
    </FloatingPanel>
  );
}
