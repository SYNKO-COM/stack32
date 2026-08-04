"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { subscribeMockChanges } from "@/lib/repositories/mock/events";

/**
 * Keeps TanStack Query in sync with the mock repositories: whenever mock
 * data changes (simulated streaming, timers), all queries are invalidated.
 * Real implementations will rely on Supabase Realtime / SSE instead.
 */
export function MockSync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    return subscribeMockChanges(() => {
      void queryClient.invalidateQueries();
    });
  }, [queryClient]);

  return null;
}
