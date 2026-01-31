import React, { useEffect, useRef, useCallback, useState } from "react";

// Idle detection constants
const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const CHECK_INTERVAL_MS = 30 * 1000; // Check every 30 seconds

export type IdleState = "active" | "idle";

export interface UseIdleDetectionOptions {
  onIdle?: () => void;
  onActive?: () => void;
  timeoutMs?: number;
}

/**
 * Hook to detect when user has been idle for a specified duration.
 * Useful for reducing background work when user is not interacting.
 */
export function useIdleDetection(options: UseIdleDetectionOptions = {}) {
  const { onIdle, onActive, timeoutMs = IDLE_TIMEOUT_MS } = options;
  const [idleState, setIdleState] = useState<IdleState>("active");
  const lastActivityRef = useRef<number>(Date.now());
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Track user activity
  const recordActivity = useCallback(() => {
    const wasIdle = idleState === "idle";
    lastActivityRef.current = Date.now();
    
    if (wasIdle) {
      setIdleState("active");
      onActive?.();
    }

    // Reset the idle timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      setIdleState("idle");
      onIdle?.();
    }, timeoutMs);
  }, [idleState, onIdle, onActive, timeoutMs]);

  useEffect(() => {
    // Activity events to monitor
    const activityEvents = [
      "mousedown",
      "keydown",
      "touchstart",
      "wheel",
      "scroll",
      "mousemove",
      "click",
    ];

    // Add listeners with { passive: true } for performance
    activityEvents.forEach((event) => {
      window.addEventListener(event, recordActivity, { passive: true });
    });

    // Start the initial timeout
    timeoutRef.current = setTimeout(() => {
      setIdleState("idle");
      onIdle?.();
    }, timeoutMs);

    return () => {
      activityEvents.forEach((event) => {
        window.removeEventListener(event, recordActivity);
      });
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [recordActivity, timeoutMs, onIdle]);

  return {
    idleState,
    isIdle: idleState === "idle",
    isActive: idleState === "active",
    recordActivity,
    lastActivityTime: lastActivityRef.current,
  };
}

/**
 * Hook to manage a cache with TTL (time-to-live) and size limits.
 * Automatically expires old entries when size limit is reached.
 */
export interface CacheOptions<K, V> {
  maxSize?: number;
  ttlMs?: number; // Time-to-live in milliseconds
}

export interface CacheEntry<V> {
  value: V;
  timestamp: number;
  accessCount: number;
}

export function useLRUCache<K, V>(options: CacheOptions<K, V> = {}) {
  const { maxSize = 10, ttlMs } = options;
  const cacheRef = useRef<Map<K, CacheEntry<V>>>(new Map());

  const get = useCallback((key: K): V | undefined => {
    const entry = cacheRef.current.get(key);
    if (!entry) return undefined;

    // Check TTL
    if (ttlMs && Date.now() - entry.timestamp > ttlMs) {
      cacheRef.current.delete(key);
      return undefined;
    }

    // Update access count and move to end (LRU)
    entry.accessCount++;
    cacheRef.current.delete(key);
    cacheRef.current.set(key, entry);

    return entry.value;
  }, [ttlMs]);

  const set = useCallback((key: K, value: V) => {
    // If at capacity, remove oldest (first) entry
    if (cacheRef.current.size >= maxSize && !cacheRef.current.has(key)) {
      const firstKey = cacheRef.current.keys().next().value;
      if (firstKey !== undefined) {
        cacheRef.current.delete(firstKey);
      }
    }

    cacheRef.current.set(key, {
      value,
      timestamp: Date.now(),
      accessCount: 0,
    });
  }, [maxSize]);

  const has = useCallback((key: K): boolean => {
    return get(key) !== undefined;
  }, [get]);

  const remove = useCallback((key: K) => {
    cacheRef.current.delete(key);
  }, []);

  const clear = useCallback(() => {
    cacheRef.current.clear();
  }, []);

  const size = useCallback(() => {
    return cacheRef.current.size;
  }, []);

  const keys = useCallback(() => {
    return Array.from(cacheRef.current.keys());
  }, []);

  return {
    get,
    set,
    has,
    remove,
    clear,
    size,
    keys,
  };
}
