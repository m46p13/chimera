import { atom } from "jotai";
import { atomFamily } from "jotai/utils";
import type { ThreadSummary } from "../types";

// List of all thread IDs
export const threadIdsAtom = atom<string[]>([]);

// Individual thread atoms (atomFamily creates one atom per thread ID)
export const threadAtomFamily = atomFamily((threadId: string) =>
  atom<ThreadSummary | null>(null)
);

// Currently active thread ID
export const activeThreadIdAtom = atom<string | null>(null);

// Pinned thread IDs
export const pinnedThreadIdsAtom = atom<Set<string>>(new Set());

// Archived thread IDs
export const archivedThreadIdsAtom = atom<Set<string>>(new Set());

// Derived atom: get all threads as array
export const threadsArrayAtom = atom((get) => {
  const ids = get(threadIdsAtom);
  return ids
    .map((id) => get(threadAtomFamily(id)))
    .filter((thread): thread is ThreadSummary => thread !== null);
});

// Derived atom: get active thread
export const activeThreadAtom = atom((get) => {
  const activeId = get(activeThreadIdAtom);
  if (!activeId) return null;
  return get(threadAtomFamily(activeId));
});

// Derived atom: pinned threads
export const pinnedThreadsAtom = atom((get) => {
  const threads = get(threadsArrayAtom);
  const pinnedIds = get(pinnedThreadIdsAtom);
  return threads.filter((t) => pinnedIds.has(t.id));
});

// Derived atom: archived threads
export const archivedThreadsAtom = atom((get) => {
  const threads = get(threadsArrayAtom);
  const archivedIds = get(archivedThreadIdsAtom);
  return threads.filter((t) => archivedIds.has(t.id));
});

// Derived atom: regular (non-pinned, non-archived) threads
export const regularThreadsAtom = atom((get) => {
  const threads = get(threadsArrayAtom);
  const pinnedIds = get(pinnedThreadIdsAtom);
  const archivedIds = get(archivedThreadIdsAtom);
  return threads.filter((t) => !pinnedIds.has(t.id) && !archivedIds.has(t.id));
});

// Derived atom: workspace ready check
export const workspaceReadyAtom = atom((get) => {
  const activeThread = get(activeThreadAtom);
  return Boolean(activeThread?.cwd);
});
