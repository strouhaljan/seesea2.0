import { useCallback, useRef } from "react";
import { formatDate } from "../utils/dateUtils";
import "./HistorySlider.css";

interface HistorySliderProps {
  timestamps: number[];
  /** Index into timestamps, or null for live mode */
  currentIndex: number | null;
  onIndexChange: (index: number | null) => void;
}

const HistorySlider = ({
  timestamps,
  currentIndex,
  onIndexChange,
}: HistorySliderProps) => {
  const isLive = currentIndex === null;
  const sliderRef = useRef<HTMLInputElement>(null);

  // Slider range: 0..timestamps.length, where timestamps.length = LIVE
  const max = timestamps.length;
  const sliderValue = isLive ? max : currentIndex;

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = parseInt(e.target.value, 10);
      if (val >= timestamps.length) {
        onIndexChange(null);
      } else {
        onIndexChange(val);
      }
    },
    [timestamps.length, onIndexChange],
  );

  const handleGoLive = useCallback(() => {
    onIndexChange(null);
  }, [onIndexChange]);

  if (timestamps.length === 0) return null;

  return (
    <div className={`history-slider ${isLive ? "" : "history-slider--active"}`}>
      <div className="history-slider__time">
        {isLive ? (
          <span className="history-slider__live-badge">LIVE</span>
        ) : (
          <>
            <span className="history-slider__timestamp">
              {formatDate(timestamps[currentIndex])}
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
        min={0}
        max={max}
        value={sliderValue}
        onChange={handleChange}
      />
    </div>
  );
};

export default HistorySlider;
