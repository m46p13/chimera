import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";

// Sidebar width (persisted)
export const sidebarWidthAtom = atomWithStorage<number>("chimera-sidebar-width", 280);

// Inspector width (persisted)
export const inspectorWidthAtom = atomWithStorage<number>("chimera-inspector-width", 360);

// Browser mode chat panel width (persisted)
export const browserChatWidthAtom = atomWithStorage<number>("chimera-browser-chat-width", 380);

// Active tab in right panel
export const activeTabAtom = atom<"files" | "terminal" | "git" | "events" | "browser" | "cloud">("events");

// Browser mode (collapses sidebars for full browser view)
export const browserModeAtom = atom<boolean>(false);

// Open dropdown menu
export const openMenuAtom = atom<null | "model" | "effort" | "preset">(null);

// History loaded flag
export const historyLoadedAtom = atom<boolean>(false);

// Stderr lines (for diagnostics)
export const stderrLinesAtom = atom<string[]>([]);

// Max constants
export const MAX_ACTIVITY = 200;
export const MAX_STDERR = 120;
