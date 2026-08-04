"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getBuilderRepository } from "@/lib/repositories/factory";
import { runSimulatedRepair } from "@/lib/repositories/mock/builder";

export function useBuilderThread(agentId: string) {
  return useQuery({
    queryKey: ["builder", agentId],
    queryFn: () => getBuilderRepository().getThread(agentId),
    enabled: Boolean(agentId),
  });
}

export function useSendBuilderMessage(agentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (content: string) => getBuilderRepository().sendMessage(agentId, content),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["builder", agentId] }),
  });
}

export function useRepairAgent(agentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    // TODO(phase-4): call POST /v1/agents/{id}/repair instead of the local simulation.
    mutationFn: async () => runSimulatedRepair(agentId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["builder", agentId] }),
  });
}
