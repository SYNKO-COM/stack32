"use client";

import { LanguageSwitcher } from "@/components/shared/language-switcher";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { useCurrentUser, useProfile } from "@/hooks/use-auth";
import { useTranslation } from "@/hooks/use-translation";
import { useUiStore } from "@/store/ui-store";

export function SettingsDialog() {
  const { t } = useTranslation(["common", "onboarding"]);
  const activeDialog = useUiStore((s) => s.activeDialog);
  const closeDialog = useUiStore((s) => s.closeDialog);
  const { data: user } = useCurrentUser();
  const { data: profile } = useProfile();

  return (
    <Dialog open={activeDialog === "settings"} onOpenChange={(o) => (!o ? closeDialog() : undefined)}>
      <DialogContent className="glass-strong border-border sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("common:actions.settings")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-medium">{profile?.firstName ?? user?.name}</p>
              <p className="text-muted-foreground">{user?.email}</p>
            </div>
          </div>
          <Separator />
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">{t("common:a11y.languageSelector")}</span>
            <LanguageSwitcher />
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">{t("common:theme.appearance")}</span>
            <ThemeToggle />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
