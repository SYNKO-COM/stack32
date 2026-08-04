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
  setSidebarOpen: (open: boolean) => void;
  setMobileSidebarOpen: (open: boolean) => void;
  openDialog: (dialog: Exclude<ActiveDialog, null>, options?: { authMode?: "login" | "signup" }) => void;
  closeDialog: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  sidebarOpen: true,
  mobileSidebarOpen: false,
  activeDialog: null,
  authDialogMode: "signup",
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setMobileSidebarOpen: (open) => set({ mobileSidebarOpen: open }),
  openDialog: (dialog, options) =>
    set((state) => ({
      activeDialog: dialog,
      authDialogMode: options?.authMode ?? state.authDialogMode,
    })),
  closeDialog: () => set({ activeDialog: null }),
}));
