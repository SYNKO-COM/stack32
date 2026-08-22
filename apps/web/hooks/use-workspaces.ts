"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { useCurrentUser } from "@/hooks/use-auth";
import { getWorkspaceRepository } from "@/lib/repositories/factory";
import {
  readActiveWorkspaceId,
  writeActiveWorkspaceId,
} from "@/lib/workspace-preference";

const workspaceKeys = {
  list: ["workspaces"] as const,
  detail: (id: string) => ["workspaces", id] as const,
};

export function useWorkspaces() {
  return useQuery({
    queryKey: workspaceKeys.list,
    queryFn: () => getWorkspaceRepository().listWorkspaces(),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    placeholderData: (previous) => previous,
  });
}

export function useActiveWorkspace() {
  const { data: user } = useCurrentUser();
  const { data: workspaces, isLoading } = useWorkspaces();
  /** Explicit user selection; otherwise derive from localStorage + list. */
  const [overrideId, setOverrideId] = useState<string | null>(null);

  const activeWorkspaceId = useMemo(() => {
    const userId = user?.id;
    if (!userId || !workspaces || workspaces.length === 0) return null;
    if (overrideId && workspaces.some((w) => w.id === overrideId)) return overrideId;
    const stored = readActiveWorkspaceId(userId);
    return stored && workspaces.some((w) => w.id === stored) ? stored : workspaces[0].id;
  }, [user, workspaces, overrideId]);

  const activeWorkspace = useMemo(
    () => workspaces?.find((w) => w.id === activeWorkspaceId) ?? workspaces?.[0] ?? null,
    [workspaces, activeWorkspaceId],
  );

  const setActiveWorkspaceId = (workspaceId: string) => {
    setOverrideId(workspaceId);
    if (user?.id) writeActiveWorkspaceId(user.id, workspaceId);
  };

  return {
    workspaces: workspaces ?? [],
    activeWorkspace,
    activeWorkspaceId: activeWorkspace?.id ?? null,
    setActiveWorkspaceId,
    isLoading,
  };
}

export function useCreateWorkspace() {
  const queryClient = useQueryClient();
  const { data: user } = useCurrentUser();
  return useMutation({
    mutationFn: (name: string) => getWorkspaceRepository().createWorkspace(name),
    onSuccess: (workspace) => {
      queryClient.setQueryData(workspaceKeys.list, (prev: unknown) => {
        if (!Array.isArray(prev)) return [workspace];
        return [workspace, ...prev];
      });
      if (user?.id) writeActiveWorkspaceId(user.id, workspace.id);
      void queryClient.invalidateQueries({ queryKey: workspaceKeys.list });
    },
  });
}

/** @deprecated Prefer useCreditUsage from use-billing — kept for accidental imports. */
export { useCreditUsage } from "@/hooks/use-billing";

