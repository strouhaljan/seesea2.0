import { useCallback, useRef } from "react";
import { formatDate } from "../utils/dateUtils";
import "./HistorySlider.css";

interface HistorySliderProps {
  /** Leg start as unix timestamp (seconds) */
  startTime: number;
  /** Current time as unix timestamp (seconds) */
  endTime: number;
  /** Selected timestamp, or null for live mode */
  currentTime: number | null;
  onTimeChange: (time: number | null) => void;
}

const HistorySlider = ({
  startTime,
  endTime,
  currentTime,
  onTimeChange,
}: HistorySliderProps) => {
  const isLive = currentTime === null;
  const sliderRef = useRef<HTMLInputElement>(null);

  // Slider range: startTime..endTime+1, where endTime+1 = LIVE
  const max = endTime + 1;
  const sliderValue = isLive ? max : currentTime;

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = parseInt(e.target.value, 10);
      if (val > endTime) {
        onTimeChange(null);
      } else {
        onTimeChange(val);
      }
    },
    [endTime, onTimeChange],
  );

  const handleGoLive = useCallback(() => {
    onTimeChange(null);
  }, [onTimeChange]);

  if (endTime <= startTime) return null;

  return (
    <div className={`history-slider ${isLive ? "" : "history-slider--active"}`}>
      <div className="history-slider__time">
        {isLive ? (
          <span className="history-slider__live-badge">LIVE</span>
        ) : (
          <>
            <span className="history-slider__timestamp">
              {formatDate(currentTime)}
            </span>
            <button className="history-slider__go-live" onClick={handleGoLive}>
              Go live
            </button>
          </>
        )}
      </div>
      <input
        ref={sliderRef}
        type="range"
        className="history-slider__input"
        min={startTime}
        max={max}
        value={sliderValue}
        onChange={handleChange}
      />
    </div>
  );
};

export default HistorySlider;
