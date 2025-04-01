import { useEffect, useState } from "react";
import LiveMap from "../components/LiveMap";
import { TripData, VesselDataPoint } from "../types/tripData";

function LiveView() {
  const [vesselsData, setVesselsData] = useState<Record<string, VesselDataPoint>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Set up polling for live data
  useEffect(() => {
    const fetchLiveData = async () => {
      try {
        setLoading(true);
        // Fetch live data from the API
        const response = await fetch("/api/cc_event/201606/data/live");

        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const data = await response.json();
        
        // Update state with the latest data
        setVesselsData(data.objects || {});
        setLastUpdated(new Date());
        setError(null);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "An unknown error occurred"
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
  const formattedTime = lastUpdated 
    ? lastUpdated.toLocaleTimeString() 
    : '';

  return (
    <div className="map-view live-view">
      <div className="live-status">
        <h2 className="view-title">Live Vessel Positions</h2>
        {lastUpdated && (
          <div className="last-updated">
            Last updated: {formattedTime}
          </div>
        )}
      </div>
      
      {loading && Object.keys(vesselsData).length === 0 && (
        <div className="loading">Loading live data...</div>
      )}
      {error && <div className="error">Error: {error}</div>}
      
      <div className="controls-container">
        <LiveMap vesselsData={vesselsData} />
      </div>
    </div>
  );
}

export default LiveView;