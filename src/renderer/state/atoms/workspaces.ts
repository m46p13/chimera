import { atom } from "jotai";
import { atomWithReset } from "jotai/utils";

export interface Workspace {
  path: string;
  name: string;
  lastOpened: number;
}

// List of all workspaces
export const workspacesAtom = atom<Workspace[]>([]);

// Current active workspace path
export const currentWorkspaceAtom = atom<string | null>(null);

// Derived atom to get current workspace object
export const currentWorkspaceObjectAtom = atom((get) => {
  const currentPath = get(currentWorkspaceAtom);
  const workspaces = get(workspacesAtom);
  if (!currentPath) return null;
  return workspaces.find((w) => w.path === currentPath) || null;
});

// Action to switch workspace
export const switchWorkspaceAtom = atom(
  null,
  async (get, set, workspacePath: string | null) => {
    if (workspacePath) {
      // Update last opened time in main process
      try {
        await window.codex?.workspaces?.touch?.(workspacePath);
      } catch {
        // Ignore errors
      }
    }
    set(currentWorkspaceAtom, workspacePath);
  }
);

// Action to add a workspace
export const addWorkspaceAtom = atom(
  null,
  async (_get, set, folderPath: string) => {
    try {
      const result = await window.codex?.workspaces?.add?.(folderPath);
      if (result?.success) {
        // Refresh workspaces list
        const workspaces = await window.codex?.workspaces?.list?.();
        if (workspaces?.success && workspaces.workspaces) {
          set(workspacesAtom, workspaces.workspaces);
        }
        return result.workspace;
      }
    } catch (err) {
      console.error("Failed to add workspace:", err);
    }
    return null;
  }
);

// Action to remove a workspace
export const removeWorkspaceAtom = atom(
  null,
  async (_get, set, folderPath: string) => {
    try {
      const result = await window.codex?.workspaces?.remove?.(folderPath);
      if (result?.success) {
        // Refresh workspaces list
        const workspaces = await window.codex?.workspaces?.list?.();
        if (workspaces?.success && workspaces.workspaces) {
          set(workspacesAtom, workspaces.workspaces);
        }
        return true;
      }
    } catch (err) {
      console.error("Failed to remove workspace:", err);
    }
    return false;
  }
);

// Load workspaces from main process
export const loadWorkspacesAtom = atom(
  null,
  async (_get, set) => {
    try {
      const result = await window.codex?.workspaces?.list?.();
      if (result?.success && result.workspaces) {
        set(workspacesAtom, result.workspaces);
      }
    } catch (err) {
      console.error("Failed to load workspaces:", err);
    }
  }
);
