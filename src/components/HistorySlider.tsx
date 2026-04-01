import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Play, Pause } from "lucide-react";
import { formatDate } from "../utils/dateUtils";
import "./HistorySlider.css";

interface HistorySliderProps {
  /** Leg start as unix timestamp (seconds) */
  startTime: number;
  /** Current time as unix timestamp (seconds) */
  endTime: number;
  /** Selected timestamp, or null for live mode */
  currentTime: number | null;
  onTimeChange: React.Dispatch<React.SetStateAction<number | null>>;
}

/** Hook that fires a callback on press, then repeatedly every 250ms while held */
function useRepeatAction(action: () => void) {
  const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined);

  const stop = useCallback(() => {
    clearInterval(intervalRef.current);
    intervalRef.current = undefined;
  }, []);

  const start = useCallback(() => {
    stop();
    action();
    intervalRef.current = setInterval(action, 250);
  }, [action, stop]);

  // Safety net: clear interval on unmount
  useEffect(() => () => clearInterval(intervalRef.current), []);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    start();
  }, [start]);

  const onContextMenu = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    stop();
  }, [stop]);

  return { onMouseDown: start, onMouseUp: stop, onMouseLeave: stop, onTouchStart, onTouchEnd: stop, onContextMenu };
}

const HistorySlider = ({
  startTime,
  endTime,
  currentTime,
  onTimeChange,
}: HistorySliderProps) => {
  const [expanded, setExpanded] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const playbackSpeedRef = useRef(playbackSpeed);
  playbackSpeedRef.current = playbackSpeed;
  const playIntervalRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const isLive = currentTime === null;
  const sliderRef = useRef<HTMLInputElement>(null);

  const max = endTime + 1;
  const sliderValue = isLive ? max : currentTime;

  const stopPlayback = useCallback(() => {
    clearInterval(playIntervalRef.current);
    playIntervalRef.current = undefined;
    setIsPlaying(false);
  }, []);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      stopPlayback();
      const val = parseInt(e.target.value, 10);
      if (val > endTime) {
        onTimeChange(null);
      } else {
        onTimeChange(val);
      }
    },
    [endTime, onTimeChange, stopPlayback],
  );

  const handleGoLive = useCallback(() => {
    stopPlayback();
    onTimeChange(null);
    setExpanded(false);
  }, [onTimeChange, stopPlayback]);

  const step = useCallback(
    (seconds: number) => {
      onTimeChange((prev) => {
        const base = prev ?? endTime;
        const next = base + seconds;
        if (next > endTime) return null;
        if (next < startTime) return startTime;
        return next;
      });
    },
    [startTime, endTime, onTimeChange],
  );

  const back5 = useRepeatAction(useCallback(() => { stopPlayback(); step(-300); }, [step, stopPlayback]));
  const back1 = useRepeatAction(useCallback(() => { stopPlayback(); step(-60); }, [step, stopPlayback]));
  const fwd1 = useRepeatAction(useCallback(() => { stopPlayback(); step(60); }, [step, stopPlayback]));
  const fwd5 = useRepeatAction(useCallback(() => { stopPlayback(); step(300); }, [step, stopPlayback]));

  // Playback interval — reads speed from ref so changing speed doesn't restart the interval
  useEffect(() => {
    if (!isPlaying) return;
    playIntervalRef.current = setInterval(() => {
      onTimeChange((prev) => {
        const base = prev ?? startTime;
        const next = base + playbackSpeedRef.current;
        if (next > endTime) {
          setTimeout(stopPlayback, 0);
          return null;
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(playIntervalRef.current);
  }, [isPlaying, startTime, endTime, onTimeChange, stopPlayback]);

  // Clean up on unmount
  useEffect(() => () => clearInterval(playIntervalRef.current), []);

  const togglePlayback = useCallback(() => {
    if (isPlaying) {
      stopPlayback();
    } else {
      // If live, start from beginning
      if (isLive) {
        onTimeChange(startTime);
      }
      setIsPlaying(true);
    }
  }, [isPlaying, isLive, startTime, onTimeChange, stopPlayback]);

  const speeds = [1, 5, 20] as const;
  const cycleSpeed = useCallback(() => {
    setPlaybackSpeed((prev) => {
      const idx = speeds.indexOf(prev as typeof speeds[number]);
      return speeds[(idx + 1) % speeds.length];
    });
  }, []);

  if (endTime <= startTime) return null;

  return (
    <div className={`history-slider ${expanded ? "" : "history-slider--collapsed"} ${!isLive ? "history-slider--active" : ""}`}>
      {expanded && (
        <div className="history-slider__panel">
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
          <div className="history-slider__controls">
            <button className="history-slider__step-btn" {...back5}>«</button>
            <button className="history-slider__step-btn" {...back1}>‹</button>
            <button
              className={`history-slider__play-btn ${isPlaying ? "history-slider__play-btn--active" : ""}`}
              onClick={togglePlayback}
              title={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? <Pause size={14} /> : <Play size={14} />}
            </button>
            <button
              className="history-slider__speed-btn"
              onClick={cycleSpeed}
              title="Playback speed"
            >
              {playbackSpeed}×
            </button>
            <input
              ref={sliderRef}
              type="range"
              className="history-slider__input"
              min={startTime}
              max={max}
              value={sliderValue}
              onChange={handleChange}
            />
            <button className="history-slider__step-btn" {...fwd1}>›</button>
            <button className="history-slider__step-btn" {...fwd5}>»</button>
          </div>
        </div>
      )}
      <div className="history-slider__ear-wrapper">
        <button
          className={`history-slider__toggle ${isLive ? "" : "history-slider__toggle--active"}`}
          onClick={() => {
            if (expanded) { handleGoLive(); setExpanded(false); }
            else setExpanded(true);
          }}
        >
          {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>
      </div>
    </div>
  );
};

export default HistorySlider;
