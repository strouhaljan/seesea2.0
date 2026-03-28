import { useEffect, useState } from "react";
import { TripData } from "../types/tripData";

interface HistoryMetadata {
  timeRange: { from: number; to: number };
  vesselIds: string[];
  totalPoints: number;
}

interface HistoryDataResult {
  metadata: HistoryMetadata | null;
  tripData: TripData | null;
  allTimestamps: number[];
  isLoading: boolean;
  loadingProgress: number;
  error: string | null;
}

export function useHistoryData(): HistoryDataResult {
  const [tripData, setTripData] = useState<TripData | null>(null);
  const [metadata, setMetadata] = useState<HistoryMetadata | null>(null);
  const [allTimestamps, setAllTimestamps] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    const fetchData = async () => {
      try {
        setIsLoading(true);
        setLoadingProgress(0);

        const response = await fetch("/data.json", {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const contentLength = response.headers.get("content-length");
        const totalBytes = contentLength ? parseInt(contentLength, 10) : null;

        if (!response.body || !totalBytes) {
          // Fallback: no streaming progress available
          const data = await response.json();
          processData(data);
          return;
        }

        // Stream the response to track download progress
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let receivedBytes = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          chunks.push(value);
          receivedBytes += value.length;
          setLoadingProgress(receivedBytes / totalBytes);
        }

        // Combine chunks and parse JSON
        const allChunks = new Uint8Array(receivedBytes);
        let position = 0;
        for (const chunk of chunks) {
          allChunks.set(chunk, position);
          position += chunk.length;
        }

        const text = new TextDecoder().decode(allChunks);
        const data = JSON.parse(text);
        processData(data);
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

    const processData = (data: TripData) => {
      setTripData(data);

      const vesselIds = Object.keys(data.objects);
      const firstVesselData = vesselIds.length > 0 ? data.objects[vesselIds[0]] : [];
      const timestamps = firstVesselData.map((point) => point.time);

      const totalPoints = Object.values(data.objects).reduce(
        (sum, points) => sum + points.length,
        0,
      );

      setAllTimestamps(timestamps);
      setMetadata({
        timeRange: {
          from: timestamps.length > 0 ? timestamps[0] : 0,
          to: timestamps.length > 0 ? timestamps[timestamps.length - 1] : 0,
        },
        vesselIds,
        totalPoints,
      });
    };

    fetchData();

    return () => controller.abort();
  }, []);

  return {
    metadata,
    tripData,
    allTimestamps,
    isLoading,
    loadingProgress,
    error,
  };
}
