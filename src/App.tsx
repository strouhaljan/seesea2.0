import { useEffect, useState } from "react";
import "./App.css";
import Map from "./components/Map";
import TimeSlider from "./components/TimeSlider";
import { TripData, VesselDataPoint } from "./types/tripData";

function App() {
  const [tripData, setTripData] = useState<TripData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPointIndex, setCurrentPointIndex] = useState(0);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        // Load data from local JSON file in public folder
        const response = await fetch("/data.json");

        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const data = await response.json();
        setTripData(data);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "An unknown error occurred",
        );
        console.error("Error fetching trip data:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Get all vessel data
  const vesselsData = tripData?.objects || {};
  
  // Find a common timeline from all vessels
  const timestamps: number[] = [];
  
  if (Object.keys(vesselsData).length > 0) {
    // Get the first vessel to extract timestamps
    const firstVesselId = Object.keys(vesselsData)[0];
    const firstVesselData = vesselsData[firstVesselId] || [];
    
    // Extract timestamps from first vessel (assuming all vessels have similar timestamps)
    timestamps.push(...(firstVesselData.map(point => point.time) || []));
  }

  return (
    <div className="app-container">
      <header>
        <h1>SeeSea 2.0</h1>
      </header>
      <main>
        {loading && <div className="loading">Loading trip data...</div>}
        {error && <div className="error">Error: {error}</div>}
        {!loading && !error && Object.keys(vesselsData).length > 0 && (
          <div className="controls-container">
            <Map 
              vesselsData={vesselsData} 
              currentPointIndex={currentPointIndex}
            />
            <TimeSlider
              currentIndex={currentPointIndex}
              setCurrentIndex={setCurrentPointIndex}
              timestamps={timestamps}
            />
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
