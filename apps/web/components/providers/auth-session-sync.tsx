"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/env";

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

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void queryClient.invalidateQueries({ queryKey: ["auth"] });
    });

    return () => subscription.unsubscribe();
  }, [queryClient]);

  return null;
}
