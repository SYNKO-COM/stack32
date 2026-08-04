"use client";

import { useParams } from "next/navigation";

import { LiveView } from "@/components/builder/live-view";

export default function LivePage() {
  const params = useParams<{ agentId: string }>();
  return <LiveView agentId={params.agentId} />;
}
