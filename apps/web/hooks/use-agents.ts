"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getAgentRepository } from "@/lib/repositories/factory";

const agentKeys = {
  list: ["agents"] as const,
  detail: (id: string) => ["agents", id] as const,
  spec: (id: string) => ["agents", id, "spec"] as const,
  version: (id: string) => ["agents", id, "version"] as const,
  graph: (id: string) => ["agents", id, "graph"] as const,
  projectStructure: (id: string) => ["agents", id, "project-structure"] as const,
};

export function useAgents(workspaceId?: string | null) {
  return useQuery({
    queryKey: [...agentKeys.list, workspaceId ?? "all"] as const,
    // A null workspace means "not scoped yet", not "do not ask". Listing without
    // one returns every agent the caller owns (RLS scopes it to them anyway).
    // Disabling the query here left a user with no workspace on a spinner
    // forever: the page waits for agents, the agents query waits for a
    // workspace, and the workspace is only created by creating an agent.
    queryFn: () => getAgentRepository().listAgents(workspaceId ?? undefined),
    refetchOnWindowFocus: false,
  });
}

export function useAgent(agentId: string) {
  return useQuery({
    queryKey: agentKeys.detail(agentId),
    queryFn: () => getAgentRepository().getAgent(agentId),
    enabled: Boolean(agentId),
    refetchOnWindowFocus: false,
  });
}

export function useAgentSpec(agentId: string) {
  return useQuery({
    queryKey: agentKeys.spec(agentId),
    queryFn: () => getAgentRepository().getSpec(agentId),
    enabled: Boolean(agentId),
  });
}

export function useAgentVersion(agentId: string) {
  return useQuery({
    queryKey: agentKeys.version(agentId),
    queryFn: () => getAgentRepository().getCurrentVersion(agentId),
    enabled: Boolean(agentId),
  });
}

export function useAgentGraph(agentId: string) {
  return useQuery({
    queryKey: agentKeys.graph(agentId),
    queryFn: async () => {
      const { getAgentGraphAction } = await import("@/lib/actions/agents");
      return getAgentGraphAction(agentId);
    },
    enabled: Boolean(agentId),
  });
}

export function useAgentProjectStructure(agentId: string) {
  return useQuery({
    queryKey: agentKeys.projectStructure(agentId),
    queryFn: async () => {
      const { getAgentProjectStructureAction } = await import("@/lib/actions/agents");
      return getAgentProjectStructureAction(agentId);
    },
    enabled: Boolean(agentId),
  });
}

export function useCreateAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input?: { name?: string; workspaceId?: string } | string) => {
      if (typeof input === "string" || input === undefined) {
        return getAgentRepository().createAgent(
          typeof input === "string" ? { name: input } : undefined,
        );
      }
      return getAgentRepository().createAgent(input);
    },
    onSuccess: (agent) => {
      queryClient.setQueryData(agentKeys.detail(agent.id), agent);
      queryClient.setQueryData(agentKeys.list, (prev: unknown) => {
        if (!Array.isArray(prev)) return [agent];
        if (prev.some((a: { id?: string }) => a?.id === agent.id)) return prev;
        return [agent, ...prev];
      });
      void queryClient.invalidateQueries({ queryKey: agentKeys.list });
    },
  });
}

export function useRenameAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ agentId, name }: { agentId: string; name: string }) =>
      getAgentRepository().renameAgent(agentId, name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: agentKeys.list }),
  });
}

export function useDuplicateAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (agentId: string) => getAgentRepository().duplicateAgent(agentId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: agentKeys.list }),
  });
}

export function useDeleteAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (agentId: string) => getAgentRepository().deleteAgent(agentId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: agentKeys.list }),
  });
}

export function usePublishAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (agentId: string) => getAgentRepository().publishAgent(agentId),
    onSuccess: (_data, agentId) => {
      queryClient.invalidateQueries({ queryKey: agentKeys.list });
      queryClient.invalidateQueries({ queryKey: agentKeys.detail(agentId) });
      queryClient.invalidateQueries({ queryKey: agentKeys.spec(agentId) });
      queryClient.invalidateQueries({ queryKey: agentKeys.graph(agentId) });
    },
  });
}
