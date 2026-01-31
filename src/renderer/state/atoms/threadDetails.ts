import { atom } from "jotai";
import { atomFamily } from "jotai/utils";
import type { ThreadDetailState, Message, ActivityItem, ItemRecord, ApprovalRequest } from "../types";
import { getEmptyThreadDetailState } from "../types";
import { activeThreadIdAtom } from "./threads";

// Per-thread detail state (atomFamily creates isolated state per thread)
export const threadDetailAtomFamily = atomFamily((threadId: string) =>
  atom<ThreadDetailState>(getEmptyThreadDetailState())
);

// Derived atom: get current thread's detail state
export const activeThreadDetailAtom = atom((get) => {
  const activeId = get(activeThreadIdAtom);
  if (!activeId) return null;
  return get(threadDetailAtomFamily(activeId));
});

// Derived atom: current thread's messages
export const activeMessagesAtom = atom((get) => {
  const detail = get(activeThreadDetailAtom);
  return detail?.messages ?? [];
});

// Derived atom: current thread's activity
export const activeActivityAtom = atom((get) => {
  const detail = get(activeThreadDetailAtom);
  return detail?.activity ?? [];
});

// Derived atom: current thread's pending approvals
export const activePendingApprovalsAtom = atom((get) => {
  const detail = get(activeThreadDetailAtom);
  return detail?.pendingApprovals ?? [];
});

// Derived atom: current thread's active turn ID
export const activeThreadTurnIdAtom = atom((get) => {
  const detail = get(activeThreadDetailAtom);
  return detail?.activeTurnId ?? null;
});

// Derived atom: current thread's status header
export const activeStatusHeaderAtom = atom((get) => {
  const detail = get(activeThreadDetailAtom);
  return detail?.statusHeader ?? "Working";
});

// Derived atom: current thread's command output
export const activeCommandOutputAtom = atom((get) => {
  const detail = get(activeThreadDetailAtom);
  return detail?.commandOutputById ?? {};
});

// Derived atom: current thread's file change output
export const activeFileChangeOutputAtom = atom((get) => {
  const detail = get(activeThreadDetailAtom);
  return detail?.fileChangeOutputById ?? {};
});

// Derived atom: current thread's turn diff
export const activeTurnDiffAtom = atom((get) => {
  const detail = get(activeThreadDetailAtom);
  return detail?.turnDiff ?? "";
});

// Derived atom: current thread's items
export const activeItemsAtom = atom((get) => {
  const detail = get(activeThreadDetailAtom);
  const activeId = get(activeThreadIdAtom);
  if (!detail || !activeId) return [];

  return detail.itemSequence
    .filter((entry) => entry.threadId === activeId)
    .map((entry) => detail.itemsById[entry.id])
    .filter(Boolean);
});
