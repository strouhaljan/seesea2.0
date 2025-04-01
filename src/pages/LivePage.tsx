import { useEffect, useState } from "react";
import { VesselDataPoint } from "../types/tripData";
import LiveMap from "../components/LiveMap";

interface LiveData {
  objects: Record<string, VesselDataPoint[]>;
}

export const LivePage = () => {
  const [liveData, setLiveData] = useState<Record<string, VesselDataPoint>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Set up polling for live data
  useEffect(() => {
    // Helper function to fetch data
    const fetchLiveData = async () => {
      try {
        setLoading(true);
        // Fetch live data from the API
        const response = await fetch("/seesea/api/cc_event/201606/data/live");

        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const data = (await response.json()) as LiveData;

        // Process the live data - each vessel should have just one current position
        const currentPositions: Record<string, VesselDataPoint> = {};

        // Extract the current position for each vessel
        if (data && data.objects) {
          Object.entries(data.objects).forEach(([vesselId, positionArray]) => {
            // If there are multiple positions, take the latest one
            if (Array.isArray(positionArray) && positionArray.length > 0) {
              currentPositions[vesselId] =
                positionArray[positionArray.length - 1];
            }
          });
        }

        // Update state with the current positions
        setLiveData(currentPositions);
        setLastUpdated(new Date());
        setError(null);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "An unknown error occurred",
        );
        console.error("Error fetching live data:", err);
      } finally {
        setLoading(false);
      }
    };

    // Initial fetch
    fetchLiveData();

    // Set up polling interval (every 10 seconds)
    const intervalId = setInterval(fetchLiveData, 10000);

    // Clean up on unmount
    return () => {
      clearInterval(intervalId);
    };
  }, []);

  // Format last updated time
  const formattedTime = lastUpdated ? lastUpdated.toLocaleTimeString() : "";

  return (
    <div className="map-view live-view">
      <div className="live-status">
        <h2 className="view-title">Live Vessel Positions</h2>
        {lastUpdated && (
          <div className="last-updated">Last updated: {formattedTime}</div>
        )}
      </div>

      {loading && Object.keys(liveData).length === 0 && (
        <div className="loading">Loading live data...</div>
      )}
      {error && <div className="error">Error: {error}</div>}

      <div className="controls-container">
        <LiveMap vesselsData={liveData} />
      </div>
    </div>
  );
};
