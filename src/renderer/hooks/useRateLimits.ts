import { useEffect } from "react";
import { useSetAtom } from "jotai";
import { rateLimitsAtom, type RateLimitSnapshot } from "../state/atoms/rateLimits";

/**
 * Hook to listen for rate limit updates from the main process.
 * This updates the rateLimitsAtom when rate limit data is received.
 */
export function useRateLimitSync() {
  const setRateLimits = useSetAtom(rateLimitsAtom);

  useEffect(() => {
    if (!window.codex?.onRateLimits) return;

    // Get initial rate limits
    window.codex.getRateLimits?.().then((snapshot) => {
      if (snapshot) {
        setRateLimits({ type: "available", data: snapshot });
      }
    }).catch(() => {
      // Ignore errors - rate limits may not be available yet
    });

    // Listen for updates
    const unsubscribe = window.codex.onRateLimits((snapshot) => {
      if (snapshot) {
        // Check if data is stale (older than 15 minutes)
        const isStale = Date.now() - snapshot.captured_at > 15 * 60 * 1000;
        setRateLimits({
          type: isStale ? "stale" : "available",
          data: snapshot,
        });
      } else {
        setRateLimits({ type: "missing" });
      }
    });

    return unsubscribe;
  }, [setRateLimits]);
}

/**
 * Hook to manually refresh rate limits.
 * This requests the current rate limits from the main process.
 */
export function useRefreshRateLimits() {
  const setRateLimits = useSetAtom(rateLimitsAtom);

  return async () => {
    if (!window.codex?.getRateLimits) return;

    try {
      const snapshot = await window.codex.getRateLimits();
      if (snapshot) {
        const isStale = Date.now() - snapshot.captured_at > 15 * 60 * 1000;
        setRateLimits({
          type: isStale ? "stale" : "available",
          data: snapshot,
        });
      } else {
        setRateLimits({ type: "missing" });
      }
    } catch {
      setRateLimits({ type: "missing" });
    }
  };
}
