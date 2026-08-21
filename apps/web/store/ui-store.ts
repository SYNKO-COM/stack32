import { create } from "zustand";

/**
 * Zustand is used ONLY for local UI state (per project convention).
 * Domain/server state lives in TanStack Query + repositories.
 */

export type ActiveDialog = "auth" | "settings" | "billing" | "upgrade" | null;

interface UiState {
  sidebarOpen: boolean;
  mobileSidebarOpen: boolean;
  activeDialog: ActiveDialog;
  /** Auth modal starts on this tab. */
  authDialogMode: "login" | "signup";
  /** Optional post-auth destination (e.g. checkout) preserved through onboarding. */
  authPreferredNext: string | null;
  /** Shared confirm dialog for first publish / republish from topbar or Live badge. */
  publishConfirmOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  setMobileSidebarOpen: (open: boolean) => void;
  setPublishConfirmOpen: (open: boolean) => void;
  openDialog: (
    dialog: Exclude<ActiveDialog, null>,
    options?: { authMode?: "login" | "signup"; preferredNext?: string | null },
  ) => void;
  closeDialog: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  sidebarOpen: true,
  mobileSidebarOpen: false,
  activeDialog: null,
  authDialogMode: "signup",
  authPreferredNext: null,
  publishConfirmOpen: false,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setMobileSidebarOpen: (open) => set({ mobileSidebarOpen: open }),
  setPublishConfirmOpen: (open) => set({ publishConfirmOpen: open }),
  openDialog: (dialog, options) =>
    set((state) => ({
      activeDialog: dialog,
      authDialogMode: options?.authMode ?? state.authDialogMode,
      // Opening auth without preferredNext clears any stale checkout path.
      authPreferredNext:
        dialog === "auth" ? (options?.preferredNext ?? null) : state.authPreferredNext,
    })),
  closeDialog: () => set({ activeDialog: null, authPreferredNext: null }),
}));
