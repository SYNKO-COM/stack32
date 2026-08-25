"use client";

import { useMemo, useState } from "react";

import { IntegrationConnectionCard } from "@/components/builder/integration-connection-card";
import { ToolConfigForm } from "@/components/builder/tool-config-form";
import { representativeToolId } from "@/lib/integrations/representative-tool";
import {
  MemoryConfigForm,
  memoryFormResetKey,
} from "@/components/builder/agent-structure/drawers/memory-config-form";
import { ModelConfigForm } from "@/components/builder/agent-structure/drawers/model-config-form";
import { ModuleErrorBanner } from "@/components/builder/agent-structure/drawers/module-error-banner";
import {
  AgentScheduleToggle,
  ScheduleTimingForm,
} from "@/components/builder/agent-structure/drawers/triggers-config-form";
import {
  AgentToolTriggerToggle,
  ToolTriggerConfigForm,
} from "@/components/builder/agent-structure/drawers/tool-trigger-form";
import type { ExecutionErrorInfo } from "@/lib/domain/execution-state";
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
import type { AgentSpec, ApprovalMode } from "@/lib/domain/types";

import type { ReactNode } from "react";

import type { AgentConnectionInfo, AgentBindingInfo } from "@/components/builder/agent-module-graph";

function normalizeAppSlug(value: string | null | undefined): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_")
    .replace(/\s+/g, "_");
}

function appsMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizeAppSlug(a);
  const nb = normalizeAppSlug(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const aliases: Record<string, Set<string>> = {
    google_calendar: new Set(["calendar", "googlecalendar"]),
    google_docs: new Set(["docs", "googledocs"]),
    google_sheets: new Set(["sheets", "googlesheets"]),
    gmail: new Set(["google_mail", "googlemail"]),
    slack_v2: new Set(["slack"]),
  };
  for (const [root, alts] of Object.entries(aliases)) {
    const group = new Set([root, ...alts]);
    if (group.has(na) && group.has(nb)) return true;
  }
  return false;
}

function resolveConnection(
  node: ProductNode | null,
  connections: AgentConnectionInfo[],
  bindings: AgentBindingInfo[],
) {
  const toolIds = node?.integration?.toolIds ?? [];
  const appKey = normalizeAppSlug(node?.integration?.appKey);
  const provider = node?.integration?.provider;

  const isActive = (c: AgentConnectionInfo) => {
    const status = (c.status || "").toLowerCase();
    return status === "active" || status === "connected" || status === "ok";
  };

  const binding = bindings.find(
    (b) => b.enabled && (b.tool_ids ?? []).some((id) => toolIds.includes(id)),
  );
  let connection = connections.find(
    (c) => c.id === binding?.connection_id && isActive(c),
  );

  if (!connection && appKey) {
    connection = connections.find((c) => {
      if (!isActive(c)) return false;
      // Never treat a suite-level Google OAuth as covering Calendar/Gmail/Docs —
      // each product app must match its own Pipedream (or scoped) connection.
      if (provider === "google" && c.provider === "google") {
        return appKey === "google";
      }
      const cApp = normalizeAppSlug(c.app_id);
      const metaApp = normalizeAppSlug(
        typeof c.provider_metadata?.app_id === "string"
          ? c.provider_metadata.app_id
          : "",
      );
      return (
        appsMatch(cApp, appKey) ||
        appsMatch(metaApp, appKey) ||
        appsMatch(cApp, provider)
      );
    });
  }

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
        onOpenAutoFocus={(event) => event.preventDefault()}
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

function DetailBlock({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-foreground/[0.02] p-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <div className="text-sm leading-relaxed text-foreground/90">{children}</div>
    </div>
  );
}

export function IntegrationDrawer({
  open,
  onOpenChange,
  node,
  agentId,
  connections,
  bindings,
  onConnectionsChanged,
  executionError,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  node: ProductNode | null;
  agentId: string;
  connections: AgentConnectionInfo[];
  bindings: AgentBindingInfo[];
  onConnectionsChanged?: () => void;
  executionError?: ExecutionErrorInfo | null;
}) {
  const { t } = useTranslation(["structure", "builder"]);
  const { connection, toolIds } = resolveConnection(
    node,
    connections,
    bindings,
  );
  // Connected only when we have an active connection for THIS app — never
  // inherit "ready" from leftover tool bindings or a suite-level Google row.
  const connected = Boolean(connection);
  const showError =
    Boolean(node) &&
    Boolean(executionError) &&
    node!.executionStatus === "error" &&
    (executionError?.nodeId === node!.id || !executionError?.nodeId);
  const waitingApproval = node?.executionStatus === "waiting_for_approval";
  // Don't show "connection needed" when the drawer already proves Connected.
  const waitingConnection =
    node?.executionStatus === "waiting_for_connection" && !connected;

  // Computed before the early return so the hook order never changes.
  const configToolId = useMemo(() => representativeToolId(toolIds), [toolIds]);
  // Bumped when an account is linked so the config form below reloads its
  // remote options in place instead of waiting for a page refresh.
  const [configRefresh, setConfigRefresh] = useState(0);
  const handleConnectionsChanged = () => {
    setConfigRefresh((v) => v + 1);
    onConnectionsChanged?.();
  };

  if (!node?.integration) return null;

  return (
    <FloatingPanel
      open={open}
      onOpenChange={onOpenChange}
      title={node.label}
      subtitle={t("structure:modules.kinds.tool")}
    >
      {showError && executionError ? (
        <ModuleErrorBanner error={executionError} agentId={agentId} />
      ) : null}
      {waitingApproval ? (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.07] p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-200">
            {t("structure:panel.waitingApprovalTitle", {
              defaultValue: "Waiting for your approval",
            })}
          </p>
          <p className="mt-1 text-sm text-amber-950/90 dark:text-amber-100/90">
            {t("structure:panel.waitingApprovalBody", {
              defaultValue:
                "This tool is connected. The yellow state means the agent paused before a sensitive action — approve or deny it in the chat.",
            })}
          </p>
        </div>
      ) : null}
      {waitingConnection ? (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.07] p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-200">
            {t("structure:panel.waitingConnectionTitle", {
              defaultValue: "Connection needed for this run",
            })}
          </p>
          <p className="mt-1 text-sm text-amber-950/90 dark:text-amber-100/90">
            {t("structure:panel.waitingConnectionBody", {
              defaultValue:
                "The agent needs an account connection before it can use this tool. Connect below, then continue in chat.",
            })}
          </p>
        </div>
      ) : null}
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
          onConnected={handleConnectionsChanged}
          onChanged={handleConnectionsChanged}
        />
      ) : (
        <p className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] px-4 py-3 text-sm text-emerald-900 dark:text-emerald-200">
          {t("structure:modules.readiness.nativeReady")}
        </p>
      )}

      {configToolId ? (
        <div className="rounded-2xl border border-border/50 p-3">
          <ToolConfigForm
            agentId={agentId}
            toolId={configToolId}
            appId={node.integration.appKey}
            onSaved={onConnectionsChanged}
            refreshKey={configRefresh}
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
  agentId,
  spec,
  modelSubtitle,
  integrationCount,
  executionError,
  published,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  node: ProductNode | null;
  agentId: string;
  spec?: AgentSpec | null;
  modelSubtitle?: string;
  integrationCount: number;
  executionError?: ExecutionErrorInfo | null;
  published?: boolean;
  onSaved?: () => void;
}) {
  const { t } = useTranslation("structure");
  if (!node) return null;

  const goal = spec?.goal?.trim();
  const instructions = spec?.instructions?.trim();
  const rules = (spec?.rules ?? []).filter(Boolean);
  const role = spec?.identity?.role?.trim();
  const showError =
    Boolean(executionError) &&
    (node.kind === "agent" ||
      node.executionStatus === "error" ||
      executionError?.nodeId === "agent" ||
      executionError?.nodeId === node.id);

  return (
    <FloatingPanel
      open={open}
      onOpenChange={onOpenChange}
      title={node.agentName || node.label}
      subtitle={t("panel.agentSubtitle")}
    >
      {showError && executionError ? (
        <ModuleErrorBanner error={executionError} agentId={agentId} />
      ) : null}

      <dl className="space-y-3 rounded-2xl border border-border/60 p-4 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">{t("modules.kinds.model")}</dt>
          <dd className="max-w-[60%] truncate text-right font-medium">
            {modelSubtitle || "—"}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">{t("sections.tools")}</dt>
          <dd className="font-medium">{integrationCount}</dd>
        </div>
        {role ? (
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">{t("panel.agentRole")}</dt>
            <dd className="max-w-[60%] text-right font-medium">{role}</dd>
          </div>
        ) : null}
      </dl>

      <DetailBlock title={t("panel.triggersTitle")}>
        <AgentScheduleToggle
          key={`${agentId}:schedule:${(spec?.triggers ?? []).some((t) => t.kind === "schedule" && t.enabled)}`}
          agentId={agentId}
          spec={spec}
          onSaved={onSaved}
        />
        <div className="mt-3">
          <AgentToolTriggerToggle
            key={`${agentId}:tool:${(spec?.triggers ?? []).find((t) => t.kind === "tool" && t.enabled)?.componentId || "off"}`}
            agentId={agentId}
            spec={spec}
            onSaved={onSaved}
          />
        </div>
      </DetailBlock>

      <p className="text-sm text-muted-foreground">{t("panel.agentReadOnlyHint")}</p>

      {goal ? (
        <DetailBlock title={t("sections.goal")}>
          <p className="whitespace-pre-wrap">{goal}</p>
        </DetailBlock>
      ) : null}

      {instructions ? (
        <DetailBlock title={t("sections.instructions")}>
          <p className="max-h-64 overflow-y-auto whitespace-pre-wrap">{instructions}</p>
        </DetailBlock>
      ) : null}

      {rules.length > 0 ? (
        <DetailBlock title={t("sections.rules")}>
          <ul className="list-disc space-y-1.5 pl-4">
            {rules.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
        </DetailBlock>
      ) : null}
    </FloatingPanel>
  );
}

export function TriggerDrawer({
  open,
  onOpenChange,
  node,
  agentId,
  spec,
  connections = [],
  published,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  node: ProductNode | null;
  agentId?: string;
  spec?: AgentSpec | null;
  connections?: AgentConnectionInfo[];
  published?: boolean;
  onSaved?: () => void;
}) {
  const { t } = useTranslation("structure");
  if (!node) return null;

  const isSchedule = node.kind === "trigger_schedule";
  const isTool = node.kind === "trigger_tool";

  return (
    <FloatingPanel
      open={open}
      onOpenChange={onOpenChange}
      title={node.label}
      subtitle={
        isTool
          ? t("panel.toolTriggerSubtitle")
          : isSchedule
            ? t("panel.scheduleSubtitle")
            : t("panel.chatSubtitle")
      }
    >
      {isTool ? (
        agentId ? (
          <ToolTriggerConfigForm
            agentId={agentId}
            spec={spec}
            published={published}
            connections={connections}
            onSaved={onSaved}
          />
        ) : null
      ) : isSchedule ? (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {node.subtitle || t("product.scheduleDefault", { defaultValue: "Runs on a schedule." })}
          </p>
          {agentId ? (
            <ScheduleTimingForm
              key={`${agentId}:schedule:${(spec?.triggers ?? [])
                .find((t) => t.kind === "schedule")
                ?.cron ?? "none"}`}
              agentId={agentId}
              spec={spec}
              onSaved={onSaved}
            />
          ) : null}
        </div>
      ) : (
        <div className="space-y-4">
          <DetailBlock title={t("panel.chatWhat")}>
            <p>{t("panel.chatWhatBody")}</p>
          </DetailBlock>
          <DetailBlock title={t("panel.chatHow")}>
            <ul className="list-disc space-y-1.5 pl-4 text-sm text-muted-foreground">
              <li>{t("panel.chatHow1")}</li>
              <li>{t("panel.chatHow2")}</li>
              <li>{t("panel.chatHow3")}</li>
            </ul>
          </DetailBlock>
          <p className="rounded-2xl border border-border/50 px-4 py-3 text-sm text-muted-foreground">
            {t("panel.chatNoConfig")}
          </p>
        </div>
      )}
    </FloatingPanel>
  );
}

export function GenericDrawer({
  open,
  onOpenChange,
  node,
  agentId,
  spec,
  onSaved,
  executionError,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  node: ProductNode | null;
  agentId: string;
  spec?: AgentSpec | null;
  onSaved?: () => void;
  executionError?: ExecutionErrorInfo | null;
}) {
  const { t } = useTranslation("structure");
  if (!node) return null;

  const isModel = node.kind === "model";
  const isMemory = node.kind === "memory";
  const isOutput = node.kind === "output";
  const showError =
    Boolean(executionError) &&
    (node.executionStatus === "error" ||
      executionError?.nodeId === node.id ||
      (isModel && executionError?.nodeId === "attachment:model") ||
      (isMemory && executionError?.nodeId === "attachment:memory") ||
      (isOutput && executionError?.nodeId === "output"));

  const subtitle = isModel
    ? t("panel.modelSubtitle")
    : isMemory
      ? t("panel.memorySubtitle")
      : t("panel.outputSubtitle");

  const outputFormat = spec?.output?.format ?? "markdown";
  const outputLabel =
    outputFormat === "table"
      ? t("values.outputTable")
      : outputFormat === "text"
        ? t("values.outputText")
        : t("values.outputMarkdown");

  return (
    <FloatingPanel
      open={open}
      onOpenChange={onOpenChange}
      title={isModel ? t("panel.modelTitle") : node.label}
      subtitle={subtitle}
    >
      {showError && executionError ? (
        <ModuleErrorBanner error={executionError} agentId={agentId} />
      ) : null}
      {isModel ? (
        <ModelConfigForm agentId={agentId} node={node} onSaved={onSaved} />
      ) : isMemory ? (
        <MemoryConfigForm
          key={memoryFormResetKey(spec?.memory)}
          agentId={agentId}
          memory={spec?.memory}
          onSaved={onSaved}
        />
      ) : isOutput ? (
        <div className="space-y-4">
          <DetailBlock title={t("panel.outputRole")}>
            <p>{t("panel.outputRoleBody")}</p>
          </DetailBlock>
          <dl className="space-y-3 rounded-2xl border border-border/60 p-4 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{t("sections.output")}</dt>
              <dd className="font-medium">{outputLabel}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{t("panel.outputTables")}</dt>
              <dd className="font-medium">
                {spec?.output?.allowTables !== false
                  ? t("values.tablesAllowed")
                  : t("panel.outputTablesOff")}
              </dd>
            </div>
          </dl>
          <p className="text-sm text-muted-foreground">{t("panel.outputEditHint")}</p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {t(`modules.help.${node.kind === "output" ? "output" : node.kind}`)}
        </p>
      )}
    </FloatingPanel>
  );
}
