"use client";

import { useParams } from "next/navigation";

import { StructureView } from "@/components/builder/structure-view";

export default function StructurePage() {
  const params = useParams<{ agentId: string }>();
  return <StructureView agentId={params.agentId} />;
}
