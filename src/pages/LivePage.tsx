import { useCallback, useState } from "react";
import { VesselDataPoint } from "../types/tripData";
import LiveMap from "../components/LiveMap";
import { usePolling } from "../hooks/usePolling";

interface LiveData {
  // Support both array format and direct object format
  objects: Record<string, VesselDataPoint[] | VesselDataPoint>;
}

export const LivePage = () => {
  const [liveData, setLiveData] = useState<Record<string, VesselDataPoint>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchLiveData = useCallback(async () => {
    try {
      setLoading(true);
      const eventId = import.meta.env.VITE_EVENT_ID || "201606";
      const response = await fetch(`/api/cc_event/${eventId}/data/live`);

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
  }, []);

  const { errorCount, currentInterval, retryNow } = usePolling(fetchLiveData, {
    interval: 10000,
    maxInterval: 60000,
    backoffFactor: 2,
  });

  // Format last updated time
  const formattedTime = lastUpdated ? lastUpdated.toLocaleTimeString() : "";

  return (
    <div className="map-view live-view">
      <div className="live-status">
        {lastUpdated && (
          <div className="last-updated">
            Last updated: {formattedTime}
            <span className="update-badge">LIVE</span>
          </div>
        )}
      </div>

      {loading && Object.keys(liveData).length === 0 && (
        <div className="loading">Loading live data...</div>
      )}
      {error && (
        <div className="error">
          Error: {error}
          {errorCount > 0 && (
            <span>
              {" "}— Retrying in {currentInterval / 1000}s...{" "}
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
