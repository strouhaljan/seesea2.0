import { useEffect, useState } from "react";
import { TripData } from "../types/tripData";

interface HistoryDataResult {
  tripData: TripData | null;
  allTimestamps: number[];
  isLoading: boolean;
  error: string | null;
}

export function useHistoryData(eventId: number | null): HistoryDataResult {
  const [tripData, setTripData] = useState<TripData | null>(null);
  const [allTimestamps, setAllTimestamps] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!eventId) return;

    const controller = new AbortController();

    const fetchData = async () => {
      try {
        setIsLoading(true);

        // First fetch metadata to get time range
        const metaRes = await fetch(`/api/history/${eventId}`, {
          signal: controller.signal,
        });
        if (!metaRes.ok) throw new Error(`HTTP error! Status: ${metaRes.status}`);
        const meta = await metaRes.json();

        // Then fetch full data using the time range
        const dataRes = await fetch(
          `/api/history/${eventId}?from=${meta.timeRange.from}&to=${meta.timeRange.to}`,
          { signal: controller.signal },
        );
        if (!dataRes.ok) throw new Error(`HTTP error! Status: ${dataRes.status}`);
        const data = await dataRes.json();

        setTripData(data);

        // Derive timestamps from first vessel's points
        const vesselIds = Object.keys(data.objects);
        const firstVesselData =
          vesselIds.length > 0 ? data.objects[vesselIds[0]] : [];
        setAllTimestamps(firstVesselData.map((point: { time: number }) => point.time));
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        const message =
          err instanceof Error ? err.message : "An unknown error occurred";
        setError(message);
        console.error("Error fetching history data:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();

    return () => controller.abort();
  }, [eventId]);

  return {
    tripData,
    allTimestamps,
    isLoading,
    error,
  };
}
