"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { AuthForm } from "@/components/auth/auth-form";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTranslation } from "@/hooks/use-translation";
import { getPendingPrompt } from "@/lib/pending-prompt";
import { getAuthRepository } from "@/lib/repositories/factory";
import { useUiStore } from "@/store/ui-store";

/**
 * Global auth modal (glass style). Opens when a visitor
 * submits a hero prompt or clicks Sign in / Get started.
 */
export function AuthModal() {
  const { t } = useTranslation("auth");
  const router = useRouter();
  const activeDialog = useUiStore((s) => s.activeDialog);
  const initialMode = useUiStore((s) => s.authDialogMode);
  const closeDialog = useUiStore((s) => s.closeDialog);
  const [mode, setMode] = useState<"login" | "signup">(initialMode);

  const open = activeDialog === "auth";
  const hasPendingPrompt = Boolean(getPendingPrompt());

  const handleSuccess = async () => {
    closeDialog();
    const profile = await getAuthRepository().getProfile();
    router.push(profile?.onboardingCompleted ? "/agents" : "/onboarding");
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? closeDialog() : undefined)}>
      <DialogContent className="glass-strong border-border sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === "login" ? t("modal.loginTitle") : t("modal.signupTitle")}
          </DialogTitle>
          {hasPendingPrompt ? (
            <DialogDescription>{t("modal.promptSaved")}</DialogDescription>
          ) : null}
        </DialogHeader>
        <AuthForm mode={mode} onModeChange={setMode} onSuccess={handleSuccess} />
      </DialogContent>
    </Dialog>
  );
}
