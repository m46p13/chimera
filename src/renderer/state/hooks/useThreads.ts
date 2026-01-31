import { useCallback } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import {
  threadIdsAtom,
  threadAtomFamily,
  activeThreadIdAtom,
  pinnedThreadIdsAtom,
  archivedThreadIdsAtom,
  threadsArrayAtom,
  activeThreadAtom,
  pinnedThreadsAtom,
  archivedThreadsAtom,
  regularThreadsAtom,
  workspaceReadyAtom,
} from "../atoms/threads";
import { threadDetailAtomFamily } from "../atoms/threadDetails";
import type { ThreadSummary } from "../types";
import { getEmptyThreadDetailState } from "../types";

export const useThreads = () => {
  const threads = useAtomValue(threadsArrayAtom);
  const pinnedThreads = useAtomValue(pinnedThreadsAtom);
  const archivedThreads = useAtomValue(archivedThreadsAtom);
  const regularThreads = useAtomValue(regularThreadsAtom);
  const [activeThreadId, setActiveThreadId] = useAtom(activeThreadIdAtom);
  const activeThread = useAtomValue(activeThreadAtom);
  const workspaceReady = useAtomValue(workspaceReadyAtom);
  const [threadIds, setThreadIds] = useAtom(threadIdsAtom);
  const [pinnedIds, setPinnedIds] = useAtom(pinnedThreadIdsAtom);
  const [archivedIds, setArchivedIds] = useAtom(archivedThreadIdsAtom);

  const upsertThread = useCallback(
    (thread: ThreadSummary) => {
      const threadAtom = threadAtomFamily(thread.id);
      // We need to use the setter from the atom
      // This is a bit tricky with atomFamily, so we'll handle it in the component
    },
    []
  );

  const togglePin = useCallback(
    (id: string) => {
      setPinnedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return next;
      });
    },
    [setPinnedIds]
  );

  const toggleArchive = useCallback(
    (id: string) => {
      setArchivedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return next;
      });
    },
    [setArchivedIds]
  );

  return {
    threads,
    pinnedThreads,
    archivedThreads,
    regularThreads,
    activeThreadId,
    setActiveThreadId,
    activeThread,
    workspaceReady,
    threadIds,
    setThreadIds,
    pinnedIds,
    setPinnedIds,
    archivedIds,
    setArchivedIds,
    togglePin,
    toggleArchive,
  };
};

// Hook for managing a single thread
export const useThread = (threadId: string) => {
  const [thread, setThread] = useAtom(threadAtomFamily(threadId));
  return { thread, setThread };
};

// Hook for managing thread detail state
export const useThreadDetail = (threadId: string) => {
  const [detail, setDetail] = useAtom(threadDetailAtomFamily(threadId));

  const resetDetail = useCallback(() => {
    setDetail(getEmptyThreadDetailState());
  }, [setDetail]);

  const addMessage = useCallback(
    (message: { id: string; role: "user" | "assistant"; text: string; streaming?: boolean }) => {
      setDetail((prev) => ({
        ...prev,
        messages: [...prev.messages, message],
      }));
    },
    [setDetail]
  );

  const updateMessage = useCallback(
    (id: string, updates: Partial<{ text: string; streaming: boolean }>) => {
      setDetail((prev) => ({
        ...prev,
        messages: prev.messages.map((msg) =>
          msg.id === id ? { ...msg, ...updates } : msg
        ),
      }));
    },
    [setDetail]
  );

  const appendMessageDelta = useCallback(
    (id: string, delta: string) => {
      setDetail((prev) => {
        const idx = prev.messages.findIndex((msg) => msg.id === id);
        if (idx >= 0) {
          const messages = [...prev.messages];
          messages[idx] = {
            ...messages[idx],
            text: messages[idx].text + delta,
            streaming: true,
          };
          return { ...prev, messages };
        }
        // Add new message if not found
        return {
          ...prev,
          messages: [...prev.messages, { id, role: "assistant" as const, text: delta, streaming: true }],
        };
      });
    },
    [setDetail]
  );

  const finalizeMessage = useCallback(
    (id: string, text: string) => {
      setDetail((prev) => {
        const idx = prev.messages.findIndex((msg) => msg.id === id);
        if (idx >= 0) {
          const messages = [...prev.messages];
          messages[idx] = { ...messages[idx], text, streaming: false };
          return { ...prev, messages };
        }
        return {
          ...prev,
          messages: [...prev.messages, { id, role: "assistant" as const, text, streaming: false }],
        };
      });
    },
    [setDetail]
  );

  const setActiveTurnId = useCallback(
    (turnId: string | null) => {
      setDetail((prev) => ({ ...prev, activeTurnId: turnId }));
    },
    [setDetail]
  );

  const setStatusHeader = useCallback(
    (header: string) => {
      setDetail((prev) => ({ ...prev, statusHeader: header }));
    },
    [setDetail]
  );

  const addPendingApproval = useCallback(
    (approval: any) => {
      setDetail((prev) => ({
        ...prev,
        pendingApprovals: [...prev.pendingApprovals, approval],
      }));
    },
    [setDetail]
  );

  const removePendingApproval = useCallback(
    (approvalId: number) => {
      setDetail((prev) => ({
        ...prev,
        pendingApprovals: prev.pendingApprovals.filter((a) => a.id !== approvalId),
      }));
    },
    [setDetail]
  );

  const appendCommandOutput = useCallback(
    (itemId: string, delta: string) => {
      setDetail((prev) => ({
        ...prev,
        commandOutputById: {
          ...prev.commandOutputById,
          [itemId]: (prev.commandOutputById[itemId] ?? "") + delta,
        },
      }));
    },
    [setDetail]
  );

  const setCommandOutput = useCallback(
    (itemId: string, output: string) => {
      setDetail((prev) => ({
        ...prev,
        commandOutputById: {
          ...prev.commandOutputById,
          [itemId]: output,
        },
      }));
    },
    [setDetail]
  );

  const appendFileChangeOutput = useCallback(
    (itemId: string, delta: string) => {
      setDetail((prev) => ({
        ...prev,
        fileChangeOutputById: {
          ...prev.fileChangeOutputById,
          [itemId]: (prev.fileChangeOutputById[itemId] ?? "") + delta,
        },
      }));
    },
    [setDetail]
  );

  const setTurnDiff = useCallback(
    (diff: string) => {
      setDetail((prev) => ({ ...prev, turnDiff: diff }));
    },
    [setDetail]
  );

  const upsertItem = useCallback(
    (item: any, threadId: string, turnId: string) => {
      if (!item?.id) return;
      setDetail((prev) => {
        const itemsById = {
          ...prev.itemsById,
          [item.id]: { item, threadId, turnId },
        };
        const hasEntry = prev.itemSequence.some((e) => e.id === item.id);
        const itemSequence = hasEntry
          ? prev.itemSequence
          : [...prev.itemSequence, { id: item.id, threadId }];
        return { ...prev, itemsById, itemSequence };
      });
    },
    [setDetail]
  );

  const pushActivity = useCallback(
    (item: Omit<any, "id" | "time">) => {
      setDetail((prev) => {
        const newItem = {
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          ...item,
        };
        const activity = [newItem, ...prev.activity].slice(0, 200);
        return { ...prev, activity };
      });
    },
    [setDetail]
  );

  const upsertActivity = useCallback(
    (id: string, update: any, options?: { appendDetail?: string }) => {
      setDetail((prev) => {
        const idx = prev.activity.findIndex((e) => e.id === id);
        if (idx === -1) {
          const newItem = {
            id,
            time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            ...update,
            detail: update.detail ?? options?.appendDetail,
          };
          return { ...prev, activity: [newItem, ...prev.activity].slice(0, 200) };
        }
        const activity = [...prev.activity];
        const appendDetail = options?.appendDetail;
        const mergedDetail = appendDetail
          ? `${activity[idx].detail ?? ""}${appendDetail}`
          : activity[idx].detail;
        activity[idx] = {
          ...activity[idx],
          ...update,
          detail: update.detail ?? mergedDetail,
        };
        return { ...prev, activity };
      });
    },
    [setDetail]
  );

  return {
    detail,
    setDetail,
    resetDetail,
    addMessage,
    updateMessage,
    appendMessageDelta,
    finalizeMessage,
    setActiveTurnId,
    setStatusHeader,
    addPendingApproval,
    removePendingApproval,
    appendCommandOutput,
    setCommandOutput,
    appendFileChangeOutput,
    setTurnDiff,
    upsertItem,
    pushActivity,
    upsertActivity,
  };
};
