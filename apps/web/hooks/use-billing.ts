"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  activatePlanAction,
  createCheckoutAction,
  getCreditUsageAction,
  type ActivatePlanInput,
} from "@/lib/actions/billing";
import type { BillingInterval } from "@/lib/billing/plans";
import { getBillingRepository } from "@/lib/repositories/factory";

export function useSubscription() {
  return useQuery({
    queryKey: ["billing", "subscription"],
    queryFn: () => getBillingRepository().getSubscription(),
  });
}

export function useCreditUsage() {
  return useQuery({
    queryKey: ["billing", "credits"],
    queryFn: () => getCreditUsageAction(),
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
    staleTime: 20_000,
  });
}

export function useCreateCheckout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      planId: string;
      interval?: BillingInterval;
      creditsMonthly?: number;
    }) =>
      createCheckoutAction(input.planId, {
        interval: input.interval,
        creditsMonthly: input.creditsMonthly,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["billing"] });
    },
  });
}

export function useActivatePlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ActivatePlanInput) => activatePlanAction(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["billing"] });
    },
  });
}
