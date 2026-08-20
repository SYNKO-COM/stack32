"use client";

import { useParams } from "next/navigation";

export default function AgentWorkspaceError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const params = useParams<{ agentId: string }>();
  const buildHref = params.agentId ? `/agents/${params.agentId}/build` : "/my-agents";

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-xl font-semibold tracking-tight">Cette page n&apos;a pas pu s&apos;afficher</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        Réessayez, ou revenez à l&apos;onglet Builder.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background"
          onClick={() => reset()}
        >
          Réessayer
        </button>
        <a
          href={buildHref}
          className="rounded-full border border-border px-4 py-2 text-sm font-medium"
        >
          Builder
        </a>
      </div>
    </div>
  );
}
