import { useEffect, useRef, useState, useCallback } from "react";

interface UsePollingOptions {
  interval?: number;
  maxInterval?: number;
  backoffFactor?: number;
  enabled?: boolean;
}

interface UsePollingReturn {
  errorCount: number;
  secondsUntilRetry: number;
  retryNow: () => void;
}

export function usePolling(
  fetchFn: () => Promise<void>,
  options: UsePollingOptions = {},
): UsePollingReturn {
  const {
    interval = 10000,
    maxInterval = 60000,
    backoffFactor = 2,
    enabled = true,
  } = options;

  const [errorCount, setErrorCount] = useState(0);
  const [secondsUntilRetry, setSecondsUntilRetry] = useState(0);

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentIntervalRef = useRef(interval);
  const fetchFnRef = useRef(fetchFn);
  fetchFnRef.current = fetchFn;

  const clearScheduled = useCallback(() => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (countdownRef.current !== null) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  }, []);

  const scheduleNext = useCallback(
    (delay: number) => {
      clearScheduled();
      const retryAt = Date.now() + delay;
      timeoutRef.current = setTimeout(() => poll(), delay);
      setSecondsUntilRetry(Math.ceil(delay / 1000));
      countdownRef.current = setInterval(() => {
        const remaining = Math.max(0, Math.ceil((retryAt - Date.now()) / 1000));
        setSecondsUntilRetry(remaining);
      }, 1000);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const poll = useCallback(async () => {
    try {
      await fetchFnRef.current();
      currentIntervalRef.current = interval;
      setErrorCount(0);
    } catch {
      const next = Math.min(
        currentIntervalRef.current * backoffFactor,
        maxInterval,
      );
      currentIntervalRef.current = next;
      setErrorCount((c) => c + 1);
    }
    scheduleNext(currentIntervalRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interval, maxInterval, backoffFactor, scheduleNext]);

  const retryNow = useCallback(() => {
    currentIntervalRef.current = interval;
    setErrorCount(0);
    clearScheduled();
    poll();
  }, [interval, clearScheduled, poll]);

  useEffect(() => {
    if (!enabled) return;
    poll();
    return clearScheduled;
  }, [enabled, poll, clearScheduled]);

  return { errorCount, secondsUntilRetry, retryNow };
}
