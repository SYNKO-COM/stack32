import { redirect } from "next/navigation";

/** Live was merged into the "Agent IA" tab. */
export default async function LivePage({
  params,
}: {
  params: Promise<{ agentId: string }>;
}) {
  const { agentId } = await params;
  redirect(`/agents/${agentId}/agent`);
}
