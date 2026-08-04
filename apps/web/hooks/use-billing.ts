"use client";

import { useMutation, useQuery } from "@tanstack/react-query";

import { getBillingRepository } from "@/lib/repositories/factory";

export function useSubscription() {
  return useQuery({
    queryKey: ["billing", "subscription"],
    queryFn: () => getBillingRepository().getSubscription(),
  });
}

export function useCreateCheckout() {
  return useMutation({
    mutationFn: (planId: string) => getBillingRepository().createCheckout(planId),
  });
}
