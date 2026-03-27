import { useState } from "react";
import "../App.css";
import Map from "../components/Map";
import TimeSlider from "../components/TimeSlider";
import { useHistoryData } from "../hooks/useHistoryData";

export const HistoryPage = () => {
  const { tripData, allTimestamps, isLoading, loadingProgress, error } =
    useHistoryData();
  const [currentPointIndex, setCurrentPointIndex] = useState(0);

  if (isLoading) {
    return (
      <div className="loading">
        Loading history data... {Math.round(loadingProgress * 100)}%
      </div>
    );
  }

  if (error) {
    return <div className="error">Error: {error}</div>;
  }

  const vesselsData = tripData?.objects || {};

  return (
    <div className="controls-container">
      <Map vesselsData={vesselsData} currentPointIndex={currentPointIndex} />
      <TimeSlider
        currentIndex={currentPointIndex}
        setCurrentIndex={setCurrentPointIndex}
        timestamps={allTimestamps}
      />
    </div>
  );
};
