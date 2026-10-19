"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/env";
import { mapSupabaseUser } from "@/lib/domain/mappers";
import type { User } from "@/lib/domain/types";

/**
 * Keeps TanStack Query auth caches in sync with Supabase Auth events
 * (OAuth return, token refresh, sign-out from another tab).
 */
export function AuthSessionSync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    let generation = 0;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      const revision = ++generation;
      // TOKEN_REFRESHED fires often and used to invalidate the whole tree (micro-refresh).
      if (event === "TOKEN_REFRESHED" || event === "INITIAL_SESSION") return;
      if (session?.user && (event === "SIGNED_IN" || event === "USER_UPDATED")) {
        // Run outside the auth lock. Immediately replace the old identity so a
        // second account never hydrates private drafts under the first cache key.
        setTimeout(() => {
          if (revision !== generation) return;
          const previous = queryClient.getQueryData<User>(["auth", "user"]);
          if (previous && previous.id !== session.user.id) queryClient.clear();
          queryClient.setQueryData(["auth", "user"], mapSupabaseUser(session.user));
          void queryClient.invalidateQueries({ queryKey: ["auth"] });
        }, 0);
        return;
      }
      if (!session?.user || event === "SIGNED_OUT") {
        queryClient.removeQueries({ queryKey: ["auth"] });
      }
    });

    return () => { generation += 1; subscription.unsubscribe(); };
  }, [queryClient]);

  return null;
}
