import { redirect } from "next/navigation";

/** Structure was merged into the "Agent IA" tab. */
export default async function StructurePage({
  params,
}: {
  params: Promise<{ agentId: string }>;
}) {
  const { agentId } = await params;
  redirect(`/agents/${agentId}/agent`);
}
