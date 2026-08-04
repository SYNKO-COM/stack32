"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getLiveRepository } from "@/lib/repositories/factory";

export function useLiveThread(agentId: string) {
  return useQuery({
    queryKey: ["live", agentId],
    queryFn: () => getLiveRepository().getThread(agentId),
    enabled: Boolean(agentId),
  });
}

export function useSendLiveMessage(agentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (content: string) => getLiveRepository().sendMessage(agentId, content),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["live", agentId] }),
  });
}

export function useClearLiveThread(agentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => getLiveRepository().clearThread(agentId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["live", agentId] }),
  });
}
