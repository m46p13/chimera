import { useCallback, useRef, useEffect } from "react";
import type { ThreadDetailState } from "../state/types";
import { getEmptyThreadDetailState } from "../state/types";

// Maximum number of threads to keep in memory cache
const MAX_CACHED_THREADS = 5;

// Maximum size of heavy data structures per thread
const MAX_ITEMS_PER_THREAD = 200;
const MAX_OUTPUT_SIZE = 50000; // characters

export interface ThreadCacheEntry {
  detail: ThreadDetailState;
  lastAccessed: number;
  accessCount: number;
}

export interface ThreadCache {
  get: (threadId: string) => ThreadDetailState | undefined;
  set: (threadId: string, detail: ThreadDetailState) => void;
  has: (threadId: string) => boolean;
  clear: (threadId?: string) => void;
  trim: () => void;
  getStats: () => { size: number; threadIds: string[] };
}

/**
 * Hook to manage an LRU cache for thread details.
 * Keeps the most recently used threads in memory for fast switching.
 */
export function useThreadCache(): ThreadCache {
  const cacheRef = useRef<Map<string, ThreadCacheEntry>>(new Map());

  // Trim heavy data from a thread detail to reduce memory usage
  const trimDetailData = useCallback((detail: ThreadDetailState): ThreadDetailState => {
    // Keep messages (essential) but trim other heavy structures
    const trimmedItemsById = Object.fromEntries(
      Object.entries(detail.itemsById).slice(-MAX_ITEMS_PER_THREAD)
    );

    const trimmedCommandOutput = Object.fromEntries(
      Object.entries(detail.commandOutputById).map(([key, value]) => [
        key,
        value.length > MAX_OUTPUT_SIZE
          ? "..." + value.slice(-MAX_OUTPUT_SIZE)
          : value,
      ])
    );

    const trimmedFileChangeOutput = Object.fromEntries(
      Object.entries(detail.fileChangeOutputById).map(([key, value]) => [
        key,
        value.length > MAX_OUTPUT_SIZE
          ? "..." + value.slice(-MAX_OUTPUT_SIZE)
          : value,
      ])
    );

    return {
      ...detail,
      itemsById: trimmedItemsById,
      itemSequence: detail.itemSequence.slice(-MAX_ITEMS_PER_THREAD),
      commandOutputById: trimmedCommandOutput,
      fileChangeOutputById: trimmedFileChangeOutput,
    };
  }, []);

  const get = useCallback((threadId: string): ThreadDetailState | undefined => {
    const entry = cacheRef.current.get(threadId);
    if (!entry) return undefined;

    // Update access metadata (LRU)
    entry.lastAccessed = Date.now();
    entry.accessCount++;
    cacheRef.current.delete(threadId);
    cacheRef.current.set(threadId, entry);

    return entry.detail;
  }, []);

  const set = useCallback((threadId: string, detail: ThreadDetailState) => {
    // Trim heavy data before caching
    const trimmedDetail = trimDetailData(detail);

    // If at capacity, remove oldest entry
    if (cacheRef.current.size >= MAX_CACHED_THREADS && !cacheRef.current.has(threadId)) {
      const oldestKey = cacheRef.current.keys().next().value;
      if (oldestKey !== undefined) {
        cacheRef.current.delete(oldestKey);
      }
    }

    cacheRef.current.set(threadId, {
      detail: trimmedDetail,
      lastAccessed: Date.now(),
      accessCount: 0,
    });
  }, [trimDetailData]);

  const has = useCallback((threadId: string): boolean => {
    return cacheRef.current.has(threadId);
  }, []);

  const clear = useCallback((threadId?: string) => {
    if (threadId) {
      cacheRef.current.delete(threadId);
    } else {
      cacheRef.current.clear();
    }
  }, []);

  // Trim cache to keep memory usage bounded
  const trim = useCallback(() => {
    while (cacheRef.current.size > MAX_CACHED_THREADS) {
      const oldestKey = cacheRef.current.keys().next().value;
      if (oldestKey !== undefined) {
        cacheRef.current.delete(oldestKey);
      }
    }
  }, []);

  const getStats = useCallback(() => ({
    size: cacheRef.current.size,
    threadIds: Array.from(cacheRef.current.keys()),
  }), []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cacheRef.current.clear();
    };
  }, []);

  return {
    get,
    set,
    has,
    clear,
    trim,
    getStats,
  };
}

/**
 * Clears non-essential heavy data from thread detail to reduce memory.
 * Call this when switching away from a thread.
 */
export function clearHeavyData(detail: ThreadDetailState): ThreadDetailState {
  return {
    ...detail,
    // Keep messages but clear heavy outputs
    commandOutputById: {},
    fileChangeOutputById: {},
    // Keep items but limit them
    itemsById: Object.fromEntries(
      Object.entries(detail.itemsById).slice(-50)
    ),
    itemSequence: detail.itemSequence.slice(-50),
    // Clear reasoning buffer
    reasoningBuffer: "",
    statusHeader: detail.statusHeader,
  };
}
