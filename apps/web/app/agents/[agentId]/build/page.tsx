"use client";

import { useParams } from "next/navigation";

import { BuildView } from "@/components/builder/build-view";

export default function BuildPage() {
  const params = useParams<{ agentId: string }>();
  return <BuildView agentId={params.agentId} />;
}
