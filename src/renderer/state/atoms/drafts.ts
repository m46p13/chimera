import { atom } from "jotai";
import { atomFamily, atomWithStorage } from "jotai/utils";
import { activeThreadIdAtom } from "./threads";

// Per-thread prompt drafts (persisted to localStorage)
export const promptDraftAtomFamily = atomFamily((threadId: string) =>
  atomWithStorage<string>(`chimera-prompt-draft-${threadId}`, "")
);

// Per-thread attached files (persisted to localStorage)
export const attachedFilesAtomFamily = atomFamily((threadId: string) =>
  atomWithStorage<string[]>(`chimera-attached-files-${threadId}`, [])
);

// Derived atom: current thread's draft
export const activePromptDraftAtom = atom(
  (get) => {
    const activeId = get(activeThreadIdAtom);
    if (!activeId) return "";
    return get(promptDraftAtomFamily(activeId));
  },
  (get, set, newValue: string) => {
    const activeId = get(activeThreadIdAtom);
    if (!activeId) return;
    set(promptDraftAtomFamily(activeId), newValue);
  }
);

// Derived atom: current thread's attached files
export const activeAttachedFilesAtom = atom(
  (get) => {
    const activeId = get(activeThreadIdAtom);
    if (!activeId) return [];
    return get(attachedFilesAtomFamily(activeId));
  },
  (get, set, newValue: string[]) => {
    const activeId = get(activeThreadIdAtom);
    if (!activeId) return;
    set(attachedFilesAtomFamily(activeId), newValue);
  }
);

// Global input state (for when no thread is selected)
export const globalInputAtom = atom<string>("");

// Unified input atom that uses draft when thread is active
export const inputAtom = atom(
  (get) => {
    const activeId = get(activeThreadIdAtom);
    if (!activeId) return get(globalInputAtom);
    return get(promptDraftAtomFamily(activeId));
  },
  (get, set, newValue: string) => {
    const activeId = get(activeThreadIdAtom);
    if (!activeId) {
      set(globalInputAtom, newValue);
    } else {
      set(promptDraftAtomFamily(activeId), newValue);
    }
  }
);
