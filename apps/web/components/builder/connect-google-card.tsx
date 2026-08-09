"use client";

import { IntegrationConnectionCard } from "@/components/builder/integration-connection-card";

export function ConnectGoogleCard({
  agentId,
  bindings,
  connections,
  onConnected,
}: {
  agentId: string;
  bindings?: Array<{ connection_id: string; tool_ids: string[]; enabled: boolean }>;
  connections?: Array<{ id: string; provider: string; status: string; account_email?: string }>;
  onConnected?: () => void;
}) {
  const googleConnection = (connections ?? []).find(
    (c) => c.provider === "google" && (c.status === "active" || c.status === "connected" || !c.status),
  );
  const connected = (bindings ?? []).some((b) => b.enabled) || Boolean(googleConnection);
  const toolIds = (bindings ?? []).flatMap((b) => b.tool_ids);

  return (
    <IntegrationConnectionCard
      provider="google"
      agentId={agentId}
      toolIds={toolIds.length > 0 ? toolIds : ["gmail", "calendar"]}
      status={connected ? "connected" : "needs_setup"}
      accountEmail={googleConnection?.account_email}
      connectionId={googleConnection?.id}
      onConnected={onConnected}
    />
  );
}
