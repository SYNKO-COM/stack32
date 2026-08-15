const KEY_PREFIX = "stack32.activeWorkspace.";

export function readActiveWorkspaceId(userId: string): string | null {
  if (typeof window === "undefined" || !userId) return null;
  try {
    return window.localStorage.getItem(KEY_PREFIX + userId);
  } catch {
    return null;
  }
}

export function writeActiveWorkspaceId(userId: string, workspaceId: string): void {
  if (typeof window === "undefined" || !userId) return;
  try {
    window.localStorage.setItem(KEY_PREFIX + userId, workspaceId);
  } catch {
    // ignore
  }
}
