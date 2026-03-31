import { useCallback, useEffect, useRef, useState } from "react";
import { VesselDataPoint, TripData } from "../types/tripData";
import { TailPoint, TailsData } from "./useTails";

interface UseHistoryDataResult {
  historyData: Record<string, VesselDataPoint>;
  historyTails: TailsData;
  loading: boolean;
}

/**
 * Fetches vessel positions for a specific point in time via the server.
 * The server caches 1-hour chunks and returns only the needed slice.
 */
export function useHistoryData(
  eventId: number | null,
  selectedTime: number | null,
  trailMinutes: number,
): UseHistoryDataResult {
  const [historyData, setHistoryData] = useState<Record<string, VesselDataPoint>>({});
  const [historyTails, setHistoryTails] = useState<TailsData>({});
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController>(undefined);

  const fetchData = useCallback(
    async (time: number, trail: number) => {
      if (!eventId) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        setLoading(true);
        const params = new URLSearchParams({
          time: String(time),
          trail: String(trail),
        });
        const res = await fetch(
          `/api/data2/${eventId}?${params}`,
          { signal: controller.signal },
        );
        if (!res.ok) return;
        const data: TripData = await res.json();

        const positions: Record<string, VesselDataPoint> = {};
        const tails: TailsData = {};

        for (const [vesselId, points] of Object.entries(data.objects ?? {})) {
          if (points.length === 0) continue;

          let best = points[0];
          for (const p of points) {
            if (p.time <= time) best = p;
          }
          positions[vesselId] = best;

          const tailPoints: TailPoint[] = points
            .filter((p) => p.time <= time)
            .map((p) => [p.time, p.coords[0], p.coords[1]]);
          if (tailPoints.length > 0) {
            tails[vesselId] = tailPoints;
          }
        }

        setHistoryData(positions);
        setHistoryTails(tails);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        console.error("Failed to fetch history data:", err);
      } finally {
        setLoading(false);
      }
    },
    [eventId],
  );

  useEffect(() => {
    if (selectedTime === null) {
      setHistoryData({});
      setHistoryTails({});
      return;
    }

    fetchData(selectedTime, trailMinutes);
  }, [selectedTime, trailMinutes, fetchData]);

  return { historyData, historyTails, loading };
}
