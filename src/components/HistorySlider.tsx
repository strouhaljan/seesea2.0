import { MutableRefObject, useCallback, useEffect, useRef, useState } from "react";
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
  /** Ref updated at 60fps with the precise simulated time (seconds) during playback */
  simTimeRef?: MutableRefObject<number | null>;
  /** Whether the panel is open (owned by the page, so phones can keep one panel open at a time). */
  expanded: boolean;
  onExpandedChange: (open: boolean) => void;
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
  simTimeRef,
  expanded,
  onExpandedChange,
}: HistorySliderProps) => {
  const setExpanded = onExpandedChange;
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const playbackSpeedRef = useRef(playbackSpeed);
  playbackSpeedRef.current = playbackSpeed;
  const isLive = currentTime === null;
  const sliderRef = useRef<HTMLInputElement>(null);

  const max = endTime + 1;
  const sliderValue = isLive ? max : currentTime;

  const stopPlayback = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      stopPlayback();
      const val = parseInt(e.target.value, 10);
      if (val > endTime) {
        if (simTimeRef) simTimeRef.current = null;
        onTimeChange(null);
      } else {
        if (simTimeRef) simTimeRef.current = val;
        onTimeChange(val);
      }
    },
    [endTime, onTimeChange, stopPlayback, simTimeRef],
  );

  const handleGoLive = useCallback(() => {
    stopPlayback();
    if (simTimeRef) simTimeRef.current = null;
    onTimeChange(null);
    setExpanded(false);
  }, [onTimeChange, stopPlayback, simTimeRef, setExpanded]);

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

  // RAF-based playback — tracks wall-clock time for smooth advancement
  const rafRef = useRef(0);
  const playStartWallRef = useRef(0);
  const playStartTimeRef = useRef(0);
  const lastEmitRef = useRef(0);
  const endTimeRef = useRef(endTime);
  endTimeRef.current = endTime;

  useEffect(() => {
    if (!isPlaying) return;

    playStartWallRef.current = performance.now();
    lastEmitRef.current = 0;

    const tick = () => {
      const elapsed = (performance.now() - playStartWallRef.current) / 1000;
      const simTime = playStartTimeRef.current + elapsed * playbackSpeedRef.current;

      if (simTime > endTimeRef.current) {
        if (simTimeRef) simTimeRef.current = null;
        onTimeChange(null);
        stopPlayback();
        return;
      }

      // Update simTimeRef at full frame rate for smooth interpolation
      if (simTimeRef) simTimeRef.current = simTime;

      // Throttle React state updates to every 200ms wall-clock
      const now = performance.now();
      if (now - lastEmitRef.current >= 200) {
        lastEmitRef.current = now;
        onTimeChange(Math.round(simTime));
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isPlaying, onTimeChange, stopPlayback]);

  const togglePlayback = useCallback(() => {
    if (isPlaying) {
      stopPlayback();
    } else {
      // Set the starting sim-time before enabling playback
      playStartTimeRef.current = isLive ? startTime : (currentTime ?? startTime);
      if (isLive) {
        onTimeChange(startTime);
      }
      setIsPlaying(true);
    }
  }, [isPlaying, isLive, startTime, currentTime, onTimeChange, stopPlayback]);

  const speeds = [1, 5, 20] as const;
  const cycleSpeed = useCallback(() => {
    setPlaybackSpeed((prev) => {
      const idx = speeds.indexOf(prev as typeof speeds[number]);
      return speeds[(idx + 1) % speeds.length];
    });
  }, []);

  // Swipe up on panel to collapse
  const touchStartY = useRef<number | null>(null);
  const onPanelTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  }, []);
  const onPanelTouchEnd = useCallback((e: React.TouchEvent) => {
    if (touchStartY.current === null) return;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    touchStartY.current = null;
    if (dy < -30) {
      handleGoLive();
    }
  }, [handleGoLive]);

  if (endTime <= startTime) return null;

  return (
    <div className={`history-slider ${expanded ? "" : "history-slider--collapsed"} ${!isLive ? "history-slider--active" : ""}`}>
      {expanded && (
        <div className="history-slider__panel" onTouchStart={onPanelTouchStart} onTouchEnd={onPanelTouchEnd}>
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
            <div className="history-slider__buttons">
              <button className="history-slider__step-btn" {...back5}>«</button>
              <button className="history-slider__step-btn" {...back1}>‹</button>
              <button
                className={`history-slider__step-btn ${isPlaying ? "history-slider__step-btn--active" : ""}`}
                onClick={togglePlayback}
                title={isPlaying ? "Pause" : "Play"}
              >
                {isPlaying ? <Pause size={14} /> : <Play size={14} />}
              </button>
              <button
                className="history-slider__step-btn history-slider__step-btn--speed"
                onClick={cycleSpeed}
                title="Playback speed"
              >
                {playbackSpeed}×
              </button>
              <button className="history-slider__step-btn" {...fwd1}>›</button>
              <button className="history-slider__step-btn" {...fwd5}>»</button>
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
