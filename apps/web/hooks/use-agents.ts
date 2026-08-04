"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getAgentRepository } from "@/lib/repositories/factory";

const agentKeys = {
  list: ["agents"] as const,
  detail: (id: string) => ["agents", id] as const,
  spec: (id: string) => ["agents", id, "spec"] as const,
  version: (id: string) => ["agents", id, "version"] as const,
};

export function useAgents() {
  return useQuery({
    queryKey: agentKeys.list,
    queryFn: () => getAgentRepository().listAgents(),
  });
}

export function useAgent(agentId: string) {
  return useQuery({
    queryKey: agentKeys.detail(agentId),
    queryFn: () => getAgentRepository().getAgent(agentId),
    enabled: Boolean(agentId),
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

export function useCreateAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name?: string) => getAgentRepository().createAgent(name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: agentKeys.list }),
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: agentKeys.list }),
  });
}
