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

  // Extract vessel track data for the specific vessel ID we're interested in
  const vesselTrackData = tripData?.objects["201502636"] as
    | VesselDataPoint[]
    | undefined;
    
  // Extract timestamps for slider
  const timestamps = vesselTrackData?.map(point => point.time) || [];

  return (
    <div className="app-container">
      <header>
        <h1>SeeSea 2.0</h1>
      </header>
      <main>
        {loading && <div className="loading">Loading trip data...</div>}
        {error && <div className="error">Error: {error}</div>}
        {!loading && !error && vesselTrackData && (
          <div className="controls-container">
            <Map 
              vesselTrackData={vesselTrackData} 
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
