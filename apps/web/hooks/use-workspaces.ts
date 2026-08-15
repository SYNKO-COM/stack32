"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useCurrentUser } from "@/hooks/use-auth";
import { getWorkspaceRepository } from "@/lib/repositories/factory";
import {
  readActiveWorkspaceId,
  writeActiveWorkspaceId,
} from "@/lib/workspace-preference";
import { useEffect, useMemo, useState } from "react";

const workspaceKeys = {
  list: ["workspaces"] as const,
  detail: (id: string) => ["workspaces", id] as const,
};

export function useWorkspaces() {
  return useQuery({
    queryKey: workspaceKeys.list,
    queryFn: () => getWorkspaceRepository().listWorkspaces(),
  });
}

export function useActiveWorkspace() {
  const { data: user } = useCurrentUser();
  const { data: workspaces, isLoading } = useWorkspaces();
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id || !workspaces || workspaces.length === 0) return;
    const stored = readActiveWorkspaceId(user.id);
    const match = stored && workspaces.some((w) => w.id === stored) ? stored : workspaces[0].id;
    setActiveId(match);
    if (match !== stored) writeActiveWorkspaceId(user.id, match);
  }, [user?.id, workspaces]);

  const activeWorkspace = useMemo(
    () => workspaces?.find((w) => w.id === activeId) ?? workspaces?.[0] ?? null,
    [workspaces, activeId],
  );

  const setActiveWorkspaceId = (workspaceId: string) => {
    setActiveId(workspaceId);
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

/** Mock credit usage until billing / metering is wired. */
export function useCreditUsage() {
  return {
    used: 320,
    limit: 1000,
  };
}
