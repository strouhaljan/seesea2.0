import { ChangeEvent } from "react";
import { formatDate } from "../utils/dateUtils";
import "./TimeSlider.css";

interface TimeSliderProps {
  currentIndex: number;
  setCurrentIndex: (index: number) => void;
  timestamps: number[];
}

const TimeSlider = ({
  currentIndex,
  setCurrentIndex,
  timestamps,
}: TimeSliderProps) => {
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setCurrentIndex(parseInt(e.target.value, 10));
  };

  return (
    <div className="time-slider-container">
      <div className="time-display">
        {timestamps[currentIndex] ? formatDate(timestamps[currentIndex]) : ""}
      </div>
      <input
        type="range"
        min="0"
        max={timestamps.length - 1}
        value={currentIndex}
        onChange={handleChange}
        className="slider"
      />
      <div className="slider-markers">
        <span>Start</span>
        <span>End</span>
      </div>
    </div>
  );
};

export default TimeSlider;
