import { useCallback, useEffect, useState } from "react";
import { VesselDataPoint } from "../types/tripData";
import LiveMap from "../components/LiveMap";
import { usePolling } from "../hooks/usePolling";
import { useEventConfig } from "../hooks/useEventConfig";

interface LiveData {
  // Support both array format and direct object format
  objects: Record<string, VesselDataPoint[] | VesselDataPoint>;
}

function formatDataAge(lastUpdated: Date): string {
  const seconds = Math.floor((Date.now() - lastUpdated.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m ago`;
}

export const LivePage = () => {
  const [liveData, setLiveData] = useState<Record<string, VesselDataPoint>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const { eventId } = useEventConfig();

  const fetchLiveData = useCallback(async () => {
    if (!eventId) return;

    try {
      setLoading(true);
      const response = await fetch(`/api/live/${eventId}`);

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      const data = (await response.json()) as LiveData;

      const currentPositions: Record<string, VesselDataPoint> = {};

      if (data && data.objects) {
        Object.entries(data.objects).forEach(([vesselId, positionData]) => {
          if (Array.isArray(positionData) && positionData.length > 0) {
            currentPositions[vesselId] =
              positionData[positionData.length - 1];
          } else if (
            typeof positionData === "object" &&
            positionData !== null
          ) {
            currentPositions[vesselId] = positionData as VesselDataPoint;
          }
        });
      }

      setLiveData(currentPositions);
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "An unknown error occurred",
      );
      console.error("Error fetching live data:", err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  const { errorCount, secondsUntilRetry, retryNow } = usePolling(
    fetchLiveData,
    {
      interval: 10000,
      maxInterval: 60000,
      backoffFactor: 2,
      enabled: !!eventId,
    },
  );

  const hasStaleData = error && Object.keys(liveData).length > 0;

  // Re-render every second while stale so the age display stays current
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!hasStaleData) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [hasStaleData]);

  return (
    <div className="map-view live-view">
      <div className="live-status">
        {lastUpdated && !error && (
          <div className="last-updated">
            Last updated: {lastUpdated.toLocaleTimeString()}
            <span className="update-badge">LIVE</span>
          </div>
        )}
      </div>

      {hasStaleData && lastUpdated && (
        <div className="stale-data-alert">
          <div className="stale-data-alert-content">
            <span className="stale-badge">CONNECTION LOST</span>
            <span className="stale-age">
              Showing data from {formatDataAge(lastUpdated)}
            </span>
            <span className="stale-retry">
              Retrying in {secondsUntilRetry}s
              <button className="stale-retry-btn" onClick={retryNow}>
                Retry now
              </button>
            </span>
          </div>
        </div>
      )}

      {loading && Object.keys(liveData).length === 0 && (
        <div className="loading">Loading live data...</div>
      )}

      {error && Object.keys(liveData).length === 0 && (
        <div className="error">
          Connection failed: {error}
          {errorCount > 0 && (
            <span>
              {" "}— Retrying in {secondsUntilRetry}s...{" "}
              <button onClick={retryNow}>Retry now</button>
            </span>
          )}
        </div>
      )}

      <div className="controls-container">
        <LiveMap vesselsData={liveData} />
      </div>
    </div>
  );
};
