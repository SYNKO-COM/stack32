"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { AuthForm } from "@/components/auth/auth-form";
import { AuthWindow } from "@/components/auth/auth-window";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTranslation } from "@/hooks/use-translation";
import { getPendingPrompt } from "@/lib/pending-prompt";
import { resolvePostAuthPath } from "@/lib/auth/post-auth";
import { useUiStore } from "@/store/ui-store";

/**
 * Large split auth window (login or signup). Opens from navbar / pricing / hero.
 */
export function AuthModal() {
  const { t } = useTranslation("auth");
  const router = useRouter();
  const activeDialog = useUiStore((s) => s.activeDialog);
  const authDialogMode = useUiStore((s) => s.authDialogMode);
  const authPreferredNext = useUiStore((s) => s.authPreferredNext);
  const closeDialog = useUiStore((s) => s.closeDialog);
  /** User toggle inside the modal; null means follow store's authDialogMode. */
  const [userMode, setUserMode] = useState<"login" | "signup" | null>(null);

  const open = activeDialog === "auth";
  const mode = userMode ?? authDialogMode;
  const hasPendingPrompt = Boolean(getPendingPrompt());

  useEffect(() => {
    if (!open) return;
    try {
      if (authPreferredNext) {
        sessionStorage.setItem("stack32_auth_next", authPreferredNext);
      } else {
        // Opening auth without a destination must not keep a prior checkout path
        // that OAuth (no URL ?next=) would otherwise still honor.
        sessionStorage.removeItem("stack32_auth_next");
      }
    } catch {
      /* ignore */
    }
  }, [open, authPreferredNext]);

  const handleClose = () => {
    setUserMode(null);
    closeDialog();
  };

  const handleSuccess = async () => {
    const preferred = authPreferredNext;
    handleClose();
    router.push(await resolvePostAuthPath(preferred));
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? handleClose() : undefined)}>
      <DialogContent
        showCloseButton
        className="fixed inset-3 z-50 flex h-auto max-h-none w-auto max-w-none translate-x-0 translate-y-0 gap-0 overflow-hidden border-0 bg-transparent p-0 shadow-none duration-200 outline-none sm:inset-4 md:inset-5 sm:max-w-none data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 [&_[data-slot=dialog-close]]:top-5 [&_[data-slot=dialog-close]]:right-5 [&_[data-slot=dialog-close]]:z-50 [&_[data-slot=dialog-close]]:flex [&_[data-slot=dialog-close]]:size-9 [&_[data-slot=dialog-close]]:items-center [&_[data-slot=dialog-close]]:justify-center [&_[data-slot=dialog-close]]:rounded-full [&_[data-slot=dialog-close]]:border [&_[data-slot=dialog-close]]:border-white/20 [&_[data-slot=dialog-close]]:bg-black/45 [&_[data-slot=dialog-close]]:text-white [&_[data-slot=dialog-close]]:opacity-100 [&_[data-slot=dialog-close]]:backdrop-blur-md [&_[data-slot=dialog-close]]:hover:bg-black/60"
      >
        <DialogTitle className="sr-only">
          {mode === "login" ? t("modal.loginTitle") : t("modal.signupTitle")}
        </DialogTitle>
        {hasPendingPrompt ? (
          <DialogDescription className="sr-only">{t("modal.promptSaved")}</DialogDescription>
        ) : (
          <DialogDescription className="sr-only">
            {mode === "login" ? t("login.subtitle") : t("signup.subtitle")}
          </DialogDescription>
        )}
        <AuthWindow
          mode={mode}
          variant="modal"
          className="h-full w-full"
          title={mode === "login" ? t("login.title") : t("signup.title")}
          subtitle={
            hasPendingPrompt
              ? t("modal.promptSaved")
              : mode === "login"
                ? t("login.subtitle")
                : t("signup.subtitle")
          }
        >
          <AuthForm
            mode={mode}
            preferredNext={authPreferredNext}
            onModeChange={setUserMode}
            onSuccess={handleSuccess}
          />
        </AuthWindow>
      </DialogContent>
    </Dialog>
  );
}
