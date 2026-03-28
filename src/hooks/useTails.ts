import { useCallback, useEffect, useRef, useState } from "react";

/** Raw tail point from the API: [timestamp, latitude, longitude] */
export type TailPoint = [number, number, number];

/** Tails data keyed by vessel ID */
export type TailsData = Record<string, TailPoint[]>;

interface TailsResponse {
  beginDate: string;
  trackLengthMax: number;
  tails: TailsData;
}

interface UseTailsResult {
  tails: TailsData;
  trackLengthMax: number;
}

export function useTails(
  eventId: number | null,
  legId: number | null,
): UseTailsResult {
  const [tails, setTails] = useState<TailsData>({});
  const [trackLengthMax, setTrackLengthMax] = useState(10800);
  const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined);

  const fetchTails = useCallback(async () => {
    if (!eventId || !legId) return;

    try {
      const res = await fetch(`/api/tails/${eventId}/${legId}`);
      if (!res.ok) return;
      const data: TailsResponse = await res.json();
      setTails(data.tails ?? {});
      setTrackLengthMax(data.trackLengthMax ?? 10800);
    } catch (err) {
      console.error("Failed to fetch tails:", err);
    }
  }, [eventId, legId]);

  useEffect(() => {
    fetchTails();
    intervalRef.current = setInterval(fetchTails, 30_000);
    return () => clearInterval(intervalRef.current);
  }, [fetchTails]);

  return { tails, trackLengthMax };
}
