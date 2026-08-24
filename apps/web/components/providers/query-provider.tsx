"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { attachQueryCachePersistence } from "@/lib/query-cache-persistence";

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
            // Returning to the tab must not refetch everything (composer remounts, micro-lag).
            refetchOnWindowFocus: false,
            refetchOnReconnect: false,
          },
        },
      }),
  );

  // Seed connections and readiness from the last visit so a reload opens on
  // what it already knew instead of on "not connected".
  useEffect(() => attachQueryCachePersistence(client), [client]);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
