"use client";

import { useParams } from "next/navigation";

import { AgentIaView } from "@/components/builder/agent-ia-view";

export default function AgentIaPage() {
  const params = useParams<{ agentId: string }>();
  return <AgentIaView agentId={params.agentId} />;
}
