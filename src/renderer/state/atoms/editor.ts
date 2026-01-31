import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { dbWorkspaceFiles } from "../db";

// Open files (paths)
export const openFilesAtom = atom<string[]>([]);

// Currently active file
export const activeFileAtom = atom<string | null>(null);

// File contents cache
export const fileContentsAtom = atom<Map<string, string>>(new Map());

// Set of dirty (modified) files
export const dirtyFilesAtom = atom<Set<string>>(new Set());

// Whether split view is enabled
export const splitViewEnabledAtom = atomWithStorage("chimera-split-view", false);

// Split view ratio (0-1, where 0.5 is 50/50 split)
export const splitRatioAtom = atomWithStorage("chimera-split-ratio", 0.5);

// Derived atom to check if a file is dirty
export const isFileDirtyAtom = atom((get) => (path: string) => {
  return get(dirtyFilesAtom).has(path);
});

// Helper to save workspace files to database
const saveWorkspaceFilesToDb = async (workspaceId: string, openFiles: string[], activeFile: string | null) => {
  try {
    const files = openFiles.map((filePath, index) => ({
      file_path: filePath,
      is_active: filePath === activeFile ? 1 : 0,
      position: index,
    }));
    await dbWorkspaceFiles.save(workspaceId, files);
  } catch (err) {
    console.error("Failed to save workspace files:", err);
  }
};

// Helper to check if a file exists
const fileExists = async (filePath: string): Promise<boolean> => {
  try {
    const result = await window.codex?.fs.stat(filePath);
    return result?.success && result?.stats?.isFile;
  } catch {
    return false;
  }
};

// Helper action atoms
export const openFileAtom = atom(
  null,
  async (get, set, { path, workspaceId }: { path: string; workspaceId?: string }) => {
    const openFiles = get(openFilesAtom);
    if (!openFiles.includes(path)) {
      set(openFilesAtom, [...openFiles, path]);
    }
    set(activeFileAtom, path);

    // Save to database if workspaceId is provided
    if (workspaceId) {
      const newOpenFiles = openFiles.includes(path) ? openFiles : [...openFiles, path];
      await saveWorkspaceFilesToDb(workspaceId, newOpenFiles, path);
    }
  }
);

export const closeFileAtom = atom(
  null,
  async (get, set, { path, workspaceId }: { path: string; workspaceId?: string }) => {
    const openFiles = get(openFilesAtom);
    const newOpenFiles = openFiles.filter((f) => f !== path);
    set(openFilesAtom, newOpenFiles);

    // Update active file if we closed the active one
    const activeFile = get(activeFileAtom);
    let newActiveFile: string | null = activeFile;
    if (activeFile === path) {
      const idx = openFiles.indexOf(path);
      newActiveFile = newOpenFiles[Math.min(idx, newOpenFiles.length - 1)] || null;
      set(activeFileAtom, newActiveFile);
    }

    // Clear dirty state
    const dirtyFiles = get(dirtyFilesAtom);
    if (dirtyFiles.has(path)) {
      const newDirtyFiles = new Set(dirtyFiles);
      newDirtyFiles.delete(path);
      set(dirtyFilesAtom, newDirtyFiles);
    }

    // Clear content cache
    const contents = get(fileContentsAtom);
    if (contents.has(path)) {
      const newContents = new Map(contents);
      newContents.delete(path);
      set(fileContentsAtom, newContents);
    }

    // Save to database if workspaceId is provided
    if (workspaceId) {
      await saveWorkspaceFilesToDb(workspaceId, newOpenFiles, newActiveFile);
    }
  }
);

export const setActiveFileAtom = atom(
  null,
  async (get, set, { path, workspaceId }: { path: string | null; workspaceId?: string }) => {
    set(activeFileAtom, path);

    // Save to database if workspaceId is provided
    if (workspaceId) {
      const openFiles = get(openFilesAtom);
      await saveWorkspaceFilesToDb(workspaceId, openFiles, path);
    }
  }
);

export const loadWorkspaceFilesAtom = atom(
  null,
  async (_get, set, workspaceId: string) => {
    try {
      const files = await dbWorkspaceFiles.load(workspaceId);
      if (files.length === 0) {
        set(openFilesAtom, []);
        set(activeFileAtom, null);
        return;
      }

      // Sort by position
      files.sort((a, b) => a.position - b.position);

      // Filter out files that no longer exist
      const existingFiles: string[] = [];
      for (const file of files) {
        if (await fileExists(file.file_path)) {
          existingFiles.push(file.file_path);
        }
      }

      // Find active file
      const activeFile = files.find((f) => f.is_active === 1);
      const activePath = activeFile?.file_path ?? existingFiles[existingFiles.length - 1] ?? null;

      set(openFilesAtom, existingFiles);
      set(activeFileAtom, activePath);
    } catch (err) {
      console.error("Failed to load workspace files:", err);
      set(openFilesAtom, []);
      set(activeFileAtom, null);
    }
  }
);

export const clearWorkspaceFilesAtom = atom(
  null,
  async (_get, set, workspaceId: string) => {
    try {
      await dbWorkspaceFiles.clear(workspaceId);
    } catch (err) {
      console.error("Failed to clear workspace files:", err);
    }
    set(openFilesAtom, []);
    set(activeFileAtom, null);
    set(fileContentsAtom, new Map());
    set(dirtyFilesAtom, new Set());
  }
);

export const setFileContentAtom = atom(
  null,
  (get, set, { path, content, markDirty = false }: { path: string; content: string; markDirty?: boolean }) => {
    const contents = new Map(get(fileContentsAtom));
    contents.set(path, content);
    set(fileContentsAtom, contents);

    if (markDirty) {
      const dirtyFiles = new Set(get(dirtyFilesAtom));
      dirtyFiles.add(path);
      set(dirtyFilesAtom, dirtyFiles);
    }
  }
);

export const saveFileAtom = atom(
  null,
  async (get, set, path: string) => {
    const content = get(fileContentsAtom).get(path);
    if (content === undefined) {
      return { success: false, error: "No content loaded for file" };
    }

    const result = await window.codex?.fs.writeFile(path, content);
    if (!result) {
      return { success: false, error: "File system API unavailable" };
    }

    if (result.success) {
      const dirtyFiles = new Set(get(dirtyFilesAtom));
      dirtyFiles.delete(path);
      set(dirtyFilesAtom, dirtyFiles);
    }

    return result;
  }
);

export const saveAllFilesAtom = atom(
  null,
  async (get, set) => {
    const dirtyFiles = Array.from(get(dirtyFilesAtom));
    if (dirtyFiles.length === 0) {
      return [];
    }

    const contents = get(fileContentsAtom);
    const results = await Promise.all(
      dirtyFiles.map(async (path) => {
        const content = contents.get(path);
        if (content === undefined) {
          return { path, success: false, error: "No content loaded for file" };
        }
        const result = await window.codex?.fs.writeFile(path, content);
        if (!result) {
          return { path, success: false, error: "File system API unavailable" };
        }
        return { path, ...result };
      })
    );

    const nextDirtyFiles = new Set(get(dirtyFilesAtom));
    for (const result of results) {
      if (result.success) {
        nextDirtyFiles.delete(result.path);
      }
    }
    set(dirtyFilesAtom, nextDirtyFiles);

    return results;
  }
);

export const markFileCleanAtom = atom(
  null,
  (get, set, path: string) => {
    const dirtyFiles = get(dirtyFilesAtom);
    if (dirtyFiles.has(path)) {
      const newDirtyFiles = new Set(dirtyFiles);
      newDirtyFiles.delete(path);
      set(dirtyFilesAtom, newDirtyFiles);
    }
  }
);
