import { useCallback, useRef, useEffect } from "react";

export interface UseDebounceOptions {
  waitMs?: number;
  leading?: boolean;
  trailing?: boolean;
}

/**
 * Hook to debounce a function call.
 * Useful for preventing rapid successive calls (e.g., thread switching).
 */
export function useDebounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  options: UseDebounceOptions = {}
) {
  const { waitMs = 100, leading = false, trailing = true } = options;
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastCallTimeRef = useRef<number>(0);
  const fnRef = useRef(fn);

  // Update fn ref when fn changes
  useEffect(() => {
    fnRef.current = fn;
  }, [fn]);

  const debouncedFn = useCallback(
    (...args: Parameters<T>) => {
      const now = Date.now();
      const isInvoking = leading && now - lastCallTimeRef.current >= waitMs;

      // Clear existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }

      if (isInvoking) {
        lastCallTimeRef.current = now;
        return fnRef.current(...args);
      }

      if (trailing) {
        timeoutRef.current = setTimeout(() => {
          lastCallTimeRef.current = Date.now();
          timeoutRef.current = null;
          fnRef.current(...args);
        }, waitMs);
      }

      return undefined;
    },
    [waitMs, leading, trailing]
  );

  // Cancel any pending calls
  const cancel = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  // Flush any pending calls immediately
  const flush = useCallback((...args: Parameters<T>) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
      return fnRef.current(...args);
    }
    return undefined;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return {
    call: debouncedFn,
    cancel,
    flush,
  };
}

/**
 * Hook to batch multiple function calls into a single execution.
 * Useful for batching rapid state updates.
 */
export function useBatchedCallback<T extends (...args: unknown[]) => unknown>(
  fn: T,
  options: { waitMs?: number } = {}
) {
  const { waitMs = 16 } = options; // Default to ~1 frame (16ms at 60fps)
  const pendingArgsRef = useRef<Parameters<T>[]>([]);
  const rafRef = useRef<number | null>(null);
  const fnRef = useRef(fn);

  useEffect(() => {
    fnRef.current = fn;
  }, [fn]);

  const batchedFn = useCallback((...args: Parameters<T>) => {
    pendingArgsRef.current.push(args);

    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(() => {
        const batchedArgs = pendingArgsRef.current;
        pendingArgsRef.current = [];
        rafRef.current = null;

        // Call with the last set of arguments
        if (batchedArgs.length > 0) {
          fnRef.current(...batchedArgs[batchedArgs.length - 1]);
        }
      });
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  return batchedFn;
}
