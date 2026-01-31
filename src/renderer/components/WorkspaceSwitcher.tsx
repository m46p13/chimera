import { useState, useRef, useEffect, useCallback } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import {
  workspacesAtom,
  currentWorkspaceAtom,
  currentWorkspaceObjectAtom,
  switchWorkspaceAtom,
  addWorkspaceAtom,
  removeWorkspaceAtom,
} from "../state/atoms/workspaces";
import { openFilesAtom, activeFileAtom } from "../state/atoms/editor";

interface WorkspaceSwitcherProps {
  onWorkspaceSwitch?: (path: string | null) => void;
}

export function WorkspaceSwitcher({ onWorkspaceSwitch }: WorkspaceSwitcherProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const workspaces = useAtomValue(workspacesAtom);
  const currentWorkspace = useAtomValue(currentWorkspaceAtom);
  const currentWorkspaceObj = useAtomValue(currentWorkspaceObjectAtom);
  const switchWorkspace = useSetAtom(switchWorkspaceAtom);
  const addWorkspace = useSetAtom(addWorkspaceAtom);
  const removeWorkspace = useSetAtom(removeWorkspaceAtom);
  const setOpenFiles = useSetAtom(openFilesAtom);
  const setActiveFile = useSetAtom(activeFileAtom);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setShowRemoveConfirm(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Sort workspaces by most recently used
  const sortedWorkspaces = [...workspaces].sort((a, b) => b.lastOpened - a.lastOpened);

  const handleSelect = useCallback(
    async (path: string) => {
      if (path === currentWorkspace) {
        setIsOpen(false);
        return;
      }

      // Close all open files and clear active file
      setOpenFiles([]);
      setActiveFile(null);

      // Switch workspace
      await switchWorkspace(path);
      onWorkspaceSwitch?.(path);
      setIsOpen(false);
    },
    [currentWorkspace, switchWorkspace, setOpenFiles, setActiveFile, onWorkspaceSwitch]
  );

  const handleAddFolder = useCallback(async () => {
    try {
      const result = await window.codex?.pickFolder?.();
      if (result && typeof result === "string") {
        const workspace = await addWorkspace(result);
        if (workspace) {
          // Close all open files and clear active file
          setOpenFiles([]);
          setActiveFile(null);

          // Switch to the new workspace
          await switchWorkspace(result);
          onWorkspaceSwitch?.(result);
        }
      }
    } catch (err) {
      console.error("Failed to add workspace:", err);
    }
    setIsOpen(false);
  }, [addWorkspace, switchWorkspace, setOpenFiles, setActiveFile, onWorkspaceSwitch]);

  const handleRemove = useCallback(
    async (e: React.MouseEvent, path: string) => {
      e.stopPropagation();

      if (showRemoveConfirm === path) {
        // Confirm removal
        const wasCurrent = currentWorkspace === path;
        await removeWorkspace(path);

        if (wasCurrent) {
          // If we removed the current workspace, switch to the next available one
          const remaining = workspaces.filter((w) => w.path !== path);
          if (remaining.length > 0) {
            const nextWorkspace = remaining.sort((a, b) => b.lastOpened - a.lastOpened)[0];
            await switchWorkspace(nextWorkspace.path);
            onWorkspaceSwitch?.(nextWorkspace.path);
          } else {
            await switchWorkspace(null);
            onWorkspaceSwitch?.(null);
          }
        }

        setShowRemoveConfirm(null);
        setIsOpen(false);
      } else {
        setShowRemoveConfirm(path);
      }
    },
    [showRemoveConfirm, currentWorkspace, workspaces, removeWorkspace, switchWorkspace, onWorkspaceSwitch]
  );

  const displayName = currentWorkspaceObj?.name || "Select workspace";

  return (
    <div className="workspace-switcher" ref={dropdownRef}>
      <button
        className="workspace-switcher-trigger"
        onClick={() => setIsOpen(!isOpen)}
        title={currentWorkspace || "Select a workspace"}
      >
        <span className="workspace-switcher-icon">📁</span>
        <span className="workspace-switcher-name">{displayName}</span>
        <span className="workspace-switcher-chevron">{isOpen ? "▲" : "▼"}</span>
      </button>

      {isOpen && (
        <div className="workspace-switcher-dropdown">
          <div className="workspace-switcher-header">
            <span>Recent Workspaces</span>
          </div>

          <div className="workspace-switcher-list">
            {sortedWorkspaces.length === 0 ? (
              <div className="workspace-switcher-empty">No workspaces yet</div>
            ) : (
              sortedWorkspaces.map((workspace) => (
                <div
                  key={workspace.path}
                  className={`workspace-switcher-item ${
                    workspace.path === currentWorkspace ? "active" : ""
                  }`}
                  onClick={() => handleSelect(workspace.path)}
                  title={workspace.path}
                >
                  <span className="workspace-switcher-item-icon">📁</span>
                  <div className="workspace-switcher-item-info">
                    <span className="workspace-switcher-item-name">{workspace.name}</span>
                    <span className="workspace-switcher-item-path">{workspace.path}</span>
                  </div>
                  <div className="workspace-switcher-item-actions">
                    {showRemoveConfirm === workspace.path ? (
                      <button
                        className="workspace-switcher-confirm-remove"
                        onClick={(e) => handleRemove(e, workspace.path)}
                        title="Click again to confirm removal"
                      >
                        Sure?
                      </button>
                    ) : (
                      <button
                        className="workspace-switcher-remove"
                        onClick={(e) => handleRemove(e, workspace.path)}
                        title="Remove from list"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="workspace-switcher-divider" />

          <button className="workspace-switcher-add" onClick={handleAddFolder}>
            <span className="workspace-switcher-add-icon">+</span>
            <span>Add Folder</span>
          </button>
        </div>
      )}
    </div>
  );
}

export default WorkspaceSwitcher;
