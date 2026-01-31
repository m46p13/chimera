import { app } from "electron";
import path from "path";
import fs from "fs";
import os from "os";

export interface Workspace {
  path: string;
  name: string;
  lastOpened: number;
}

const CHIMERA_DIR = path.join(os.homedir(), ".chimera");
const WORKSPACES_FILE = path.join(CHIMERA_DIR, "workspaces.json");

// Ensure the .chimera directory exists
const ensureChimeraDir = () => {
  if (!fs.existsSync(CHIMERA_DIR)) {
    fs.mkdirSync(CHIMERA_DIR, { recursive: true });
  }
};

// Read workspaces from file
const readWorkspaces = (): Workspace[] => {
  try {
    ensureChimeraDir();
    if (!fs.existsSync(WORKSPACES_FILE)) {
      return [];
    }
    const content = fs.readFileSync(WORKSPACES_FILE, "utf-8");
    const data = JSON.parse(content);
    if (Array.isArray(data)) {
      return data.map((w: any) => ({
        path: w.path,
        name: w.name || path.basename(w.path),
        lastOpened: w.lastOpened || Date.now(),
      }));
    }
  } catch (err) {
    console.error("Failed to read workspaces:", err);
  }
  return [];
};

// Write workspaces to file
const writeWorkspaces = (workspaces: Workspace[]) => {
  try {
    ensureChimeraDir();
    fs.writeFileSync(WORKSPACES_FILE, JSON.stringify(workspaces, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to write workspaces:", err);
  }
};

// Get folder name from path
const getFolderName = (folderPath: string): string => {
  return path.basename(folderPath);
};

// List all workspaces
export const listWorkspaces = (): Workspace[] => {
  return readWorkspaces();
};

// Add a new workspace
export const addWorkspace = (folderPath: string): Workspace => {
  const workspaces = readWorkspaces();

  // Check if workspace already exists
  const existingIndex = workspaces.findIndex((w) => w.path === folderPath);

  const newWorkspace: Workspace = {
    path: folderPath,
    name: getFolderName(folderPath),
    lastOpened: Date.now(),
  };

  if (existingIndex >= 0) {
    // Update existing workspace's lastOpened
    workspaces[existingIndex] = newWorkspace;
  } else {
    // Add new workspace
    workspaces.push(newWorkspace);
  }

  writeWorkspaces(workspaces);
  return newWorkspace;
};

// Remove a workspace
export const removeWorkspace = (folderPath: string): boolean => {
  const workspaces = readWorkspaces();
  const index = workspaces.findIndex((w) => w.path === folderPath);

  if (index >= 0) {
    workspaces.splice(index, 1);
    writeWorkspaces(workspaces);
    return true;
  }

  return false;
};

// Get recent workspaces sorted by lastOpened
export const getRecentWorkspaces = (limit: number = 10): Workspace[] => {
  const workspaces = readWorkspaces();
  return workspaces
    .sort((a, b) => b.lastOpened - a.lastOpened)
    .slice(0, limit);
};

// Update lastOpened for a workspace
export const touchWorkspace = (folderPath: string): void => {
  const workspaces = readWorkspaces();
  const index = workspaces.findIndex((w) => w.path === folderPath);

  if (index >= 0) {
    workspaces[index].lastOpened = Date.now();
    writeWorkspaces(workspaces);
  }
};
