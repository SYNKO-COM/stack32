"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { LanguageSwitcher } from "@/components/shared/language-switcher";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  useCurrentUser,
  useDeleteAccount,
  useProfile,
  useSetUsername,
} from "@/hooks/use-auth";
import { useTranslation } from "@/hooks/use-translation";
import { getAuthRepository } from "@/lib/repositories/factory";
import { useUiStore } from "@/store/ui-store";

const USERNAME_FORMAT = /^[a-z][a-z0-9_]{2,29}$/;

function isUsernameLocallyInvalid(value: string): boolean {
  return !USERNAME_FORMAT.test(value) || value.includes("stack32");
}

export function SettingsDialog() {
  const { t } = useTranslation(["common", "auth", "onboarding"]);
  const router = useRouter();
  const activeDialog = useUiStore((s) => s.activeDialog);
  const closeDialog = useUiStore((s) => s.closeDialog);
  const { data: user } = useCurrentUser();
  const { data: profile } = useProfile();
  const setUsername = useSetUsername();
  const deleteAccount = useDeleteAccount();

  const [draftUsername, setDraftUsername] = useState("");
  const [remoteStatus, setRemoteStatus] = useState<{
    forValue: string;
    status: "available" | "taken" | "reserved" | "invalid" | "saved" | "error" | "idle";
  } | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState(false);

  const needsUsername = Boolean(profile && !profile.username);
  const normalizedDraft = draftUsername.trim().toLowerCase();
  const localStatus: "idle" | "invalid" | "reserved" | null = !needsUsername
    ? "idle"
    : !normalizedDraft
      ? "idle"
      : normalizedDraft.includes("stack32")
        ? "reserved"
        : !USERNAME_FORMAT.test(normalizedDraft)
          ? "invalid"
          : null;
  const status =
    savedFlash
      ? "saved"
      : (localStatus ??
        (remoteStatus?.forValue === normalizedDraft
          ? remoteStatus.status
          : needsUsername && normalizedDraft
            ? "checking"
            : "idle"));

  useEffect(() => {
    if (!needsUsername || localStatus !== null) return;
    const normalized = normalizedDraft;
    const handle = window.setTimeout(() => {
      void getAuthRepository()
        .checkUsernameAvailability(normalized)
        .then((result) => {
          if (!result.valid) {
            setRemoteStatus({
              forValue: normalized,
              status: result.reason === "reserved" ? "reserved" : "invalid",
            });
            return;
          }
          setRemoteStatus({
            forValue: normalized,
            status: result.available ? "available" : "taken",
          });
        })
        .catch(() => {
          setRemoteStatus({ forValue: normalized, status: "error" });
        });
    }, 300);
    return () => window.clearTimeout(handle);
  }, [draftUsername, needsUsername, localStatus, normalizedDraft]);

  useEffect(() => {
    if (activeDialog !== "settings") {
      setConfirmDeleteOpen(false);
      setDeleteError(false);
    }
  }, [activeDialog]);

  return (
    <>
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
                {profile?.username ? (
                  <p className="mt-1 text-xs text-muted-foreground">@{profile.username}</p>
                ) : null}
              </div>
            </div>
            {needsUsername ? (
              <>
                <Separator />
                <div className="space-y-2">
                  <p className="font-medium">{t("onboarding:username.settingsTitle")}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("onboarding:username.settingsBody")}
                  </p>
                  <div className="space-y-1.5">
                    <Label htmlFor="settings-username">{t("onboarding:step3.username")}</Label>
                    <div className="relative">
                      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground">
                        @
                      </span>
                      <Input
                        id="settings-username"
                        value={draftUsername}
                        onChange={(e) => {
                          setSavedFlash(false);
                          setDraftUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""));
                        }}
                        className="pl-7"
                        placeholder={t("onboarding:step3.usernamePlaceholder")}
                        spellCheck={false}
                      />
                    </div>
                    {status === "available" ? (
                      <p className="text-xs text-emerald-600 dark:text-emerald-400">
                        {t("onboarding:step3.usernameAvailable")}
                      </p>
                    ) : null}
                    {status === "taken" ? (
                      <p className="text-xs text-destructive">{t("onboarding:step3.usernameTaken")}</p>
                    ) : null}
                    {status === "invalid" || status === "reserved" ? (
                      <p className="text-xs text-destructive">
                        {status === "reserved"
                          ? t("onboarding:step3.usernameReserved")
                          : t("onboarding:step3.usernameInvalid")}
                      </p>
                    ) : null}
                    {status === "saved" ? (
                      <p className="text-xs text-emerald-600 dark:text-emerald-400">
                        {t("onboarding:username.saved")}
                      </p>
                    ) : null}
                  </div>
                  <Button
                    size="sm"
                    className="rounded-full"
                    disabled={
                      status !== "available" ||
                      setUsername.isPending ||
                      isUsernameLocallyInvalid(normalizedDraft)
                    }
                    onClick={() => {
                      void setUsername
                        .mutateAsync(draftUsername.trim().toLowerCase())
                        .then(() => {
                          setSavedFlash(true);
                          setRemoteStatus(null);
                        })
                        .catch(() => {
                          setSavedFlash(false);
                          setRemoteStatus({
                            forValue: normalizedDraft,
                            status: "error",
                          });
                        });
                    }}
                  >
                    {t("onboarding:username.save")}
                  </Button>
                </div>
              </>
            ) : null}
            <Separator />
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">{t("common:a11y.languageSelector")}</span>
              <LanguageSwitcher />
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">{t("common:theme.appearance")}</span>
              <ThemeToggle />
            </div>
            <Separator />
            <Link
              href="/settings/password"
              className="block text-brand hover:underline"
              onClick={() => closeDialog()}
            >
              {t("auth:changePassword.title")}
            </Link>
            <Separator />
            <div className="space-y-2">
              <p className="font-medium text-destructive">{t("common:account.dangerZone")}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-full border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => {
                  setDeleteError(false);
                  setConfirmDeleteOpen(true);
                }}
              >
                {t("common:account.deleteAccount")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={confirmDeleteOpen}
        onOpenChange={(open) => {
          if (deleteAccount.isPending) return;
          setConfirmDeleteOpen(open);
          if (!open) setDeleteError(false);
        }}
      >
        <DialogContent className="glass-strong border-border sm:max-w-md" showCloseButton={!deleteAccount.isPending}>
          <DialogHeader>
            <DialogTitle>{t("common:account.deleteConfirmTitle")}</DialogTitle>
            <DialogDescription>{t("common:account.deleteConfirmBody")}</DialogDescription>
          </DialogHeader>
          {deleteError ? (
            <p className="text-sm text-destructive">{t("common:account.deleteError")}</p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              disabled={deleteAccount.isPending}
              onClick={() => setConfirmDeleteOpen(false)}
            >
              {t("common:actions.cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="rounded-full"
              disabled={deleteAccount.isPending}
              onClick={() => {
                setDeleteError(false);
                void deleteAccount
                  .mutateAsync()
                  .then(() => {
                    setConfirmDeleteOpen(false);
                    closeDialog();
                    router.replace("/");
                  })
                  .catch(() => {
                    setDeleteError(true);
                  });
              }}
            >
              {deleteAccount.isPending
                ? t("common:account.deleting")
                : t("common:account.deleteConfirmAction")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
