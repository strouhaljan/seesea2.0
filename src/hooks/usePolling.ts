import { useEffect, useRef, useState, useCallback } from "react";

interface UsePollingOptions {
  interval?: number;
  maxInterval?: number;
  backoffFactor?: number;
}

interface UsePollingReturn {
  errorCount: number;
  currentInterval: number;
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
  } = options;

  const [errorCount, setErrorCount] = useState(0);
  const [currentInterval, setCurrentInterval] = useState(interval);

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentIntervalRef = useRef(interval);
  const fetchFnRef = useRef(fetchFn);
  fetchFnRef.current = fetchFn;

  const clearScheduled = useCallback(() => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const scheduleNext = useCallback(
    (delay: number) => {
      clearScheduled();
      timeoutRef.current = setTimeout(() => poll(), delay);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const poll = useCallback(async () => {
    try {
      await fetchFnRef.current();
      currentIntervalRef.current = interval;
      setCurrentInterval(interval);
      setErrorCount(0);
    } catch {
      const next = Math.min(
        currentIntervalRef.current * backoffFactor,
        maxInterval,
      );
      currentIntervalRef.current = next;
      setCurrentInterval(next);
      setErrorCount((c) => c + 1);
    }
    scheduleNext(currentIntervalRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interval, maxInterval, backoffFactor, scheduleNext]);

  const retryNow = useCallback(() => {
    currentIntervalRef.current = interval;
    setCurrentInterval(interval);
    setErrorCount(0);
    clearScheduled();
    poll();
  }, [interval, clearScheduled, poll]);

  useEffect(() => {
    poll();
    return clearScheduled;
  }, [poll, clearScheduled]);

  return { errorCount, currentInterval, retryNow };
}
