import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { VesselDataPoint } from "../types/tripData";
import LiveMap, { LiveMapHandle } from "../components/LiveMap";
import BoatPanel from "../components/BoatPanel";
import HistorySlider from "../components/HistorySlider";
import { usePolling } from "../hooks/usePolling";
import { useEventConfig } from "../hooks/useEventConfig";
import { useTails } from "../hooks/useTails";
import { useLegMarkers } from "../hooks/useLegMarkers";
import { useHistoryData } from "../hooks/useHistoryData";

interface LiveData {
  // Support both array format and direct object format
  objects: Record<string, VesselDataPoint[] | VesselDataPoint>;
}

function formatDataAge(lastUpdated: Date): string {
  const seconds = Math.floor((Date.now() - lastUpdated.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m ago`;
}

interface LivePageProps {
  panelCollapsed: boolean;
  onTogglePanel: () => void;
  controlsOpen: boolean;
  onToggleControls: () => void;
}

export const LivePage = ({ panelCollapsed, onTogglePanel, controlsOpen, onToggleControls }: LivePageProps) => {
  const [liveData, setLiveData] = useState<Record<string, VesselDataPoint>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const { eventId, crews, legs } = useEventConfig();
  const mapRef = useRef<LiveMapHandle>(null);

  // Pick the current active leg for tails (last active leg by start date)
  const activeLeg = useMemo(() => {
    const active = legs.filter((l) => l.active === 1);
    if (active.length === 0) return null;
    const now = Date.now();
    const current = active.find(
      (l) => new Date(l.start).getTime() <= now && new Date(l.end).getTime() >= now,
    );
    return current ?? active[0];
  }, [legs]);

  const activeLegId = activeLeg?.id ?? null;
  const legStartTime = activeLeg ? Math.floor(new Date(activeLeg.start).getTime() / 1000) : 0;
  const nowTime = Math.floor(Date.now() / 1000);

  const { tails, trackLengthMax } = useTails(eventId, activeLegId);
  const legMarkers = useLegMarkers(eventId, activeLegId);
  const [selectedTime, setSelectedTime] = useState<number | null>(null);
  const [trailMinutes, setTrailMinutes] = useState(
    () => parseInt(localStorage.getItem("trailMinutes") || "0", 10),
  );
  const { historyData, historyTails } = useHistoryData(eventId, selectedTime, trailMinutes);
  const [activeBoatId, setActiveBoatId] = useState<number | null>(null);
  const [followedBoatId, setFollowedBoatId] = useState<number | null>(null);

  // Sync trailMinutes from localStorage (LiveMap dispatches trailMinutesChanged)
  useEffect(() => {
    const handler = () => setTrailMinutes(parseInt(localStorage.getItem("trailMinutes") || "0", 10));
    window.addEventListener("trailMinutesChanged", handler);
    return () => window.removeEventListener("trailMinutesChanged", handler);
  }, []);

  const isHistoryMode = selectedTime !== null;
  const displayData = isHistoryMode && Object.keys(historyData).length > 0 ? historyData : liveData;

  const handleBoatClick = useCallback((boatId: number) => {
    setActiveBoatId(boatId);
    setFollowedBoatId(boatId);
    if (panelCollapsed) onTogglePanel();
  }, [panelCollapsed, onTogglePanel]);

  const handleClearActive = useCallback(() => {
    setActiveBoatId(null);
    setFollowedBoatId(null);
  }, []);

  const handleStopFollow = useCallback(() => {
    setFollowedBoatId(null);
  }, []);

  const handleFocusBoat = useCallback((boatId: number) => {
    setFollowedBoatId(boatId);
    const data = displayData[String(boatId)];
    if (data?.coords) {
      mapRef.current?.flyTo(data.coords);
    }
  }, [displayData]);

  const fetchLiveData = useCallback(async () => {
    if (!eventId) return;

    try {
      setLoading(true);
      const response = await fetch(`/api/live/${eventId}`);

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      const data = (await response.json()) as LiveData;

      const currentPositions: Record<string, VesselDataPoint> = {};

      if (data && data.objects) {
        Object.entries(data.objects).forEach(([vesselId, positionData]) => {
          if (Array.isArray(positionData) && positionData.length > 0) {
            currentPositions[vesselId] =
              positionData[positionData.length - 1];
          } else if (
            typeof positionData === "object" &&
            positionData !== null
          ) {
            currentPositions[vesselId] = positionData as VesselDataPoint;
          }
        });
      }

      setLiveData(currentPositions);
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "An unknown error occurred",
      );
      console.error("Error fetching live data:", err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  const { errorCount, secondsUntilRetry, retryNow } = usePolling(
    fetchLiveData,
    {
      interval: 10000,
      maxInterval: 60000,
      backoffFactor: 2,
      enabled: !!eventId,
    },
  );

  const hasStaleData = error && Object.keys(liveData).length > 0;

  // Re-render every second while stale so the age display stays current
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!hasStaleData) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [hasStaleData]);

  return (
    <div className="map-view live-view">
      {hasStaleData && lastUpdated && (
        <div className="stale-data-alert">
          <div className="stale-data-alert-content">
            <span className="stale-badge">CONNECTION LOST</span>
            <span className="stale-age">
              Showing data from {formatDataAge(lastUpdated)}
            </span>
            <span className="stale-retry">
              Retrying in {secondsUntilRetry}s
              <button className="stale-retry-btn" onClick={retryNow}>
                Retry now
              </button>
            </span>
          </div>
        </div>
      )}

      {loading && Object.keys(liveData).length === 0 && (
        <div className="loading">Loading live data...</div>
      )}

      {error && Object.keys(liveData).length === 0 && (
        <div className="error">
          Connection failed: {error}
          {errorCount > 0 && (
            <span>
              {" "} — Retrying in {secondsUntilRetry}s...{" "}
              <button onClick={retryNow}>Retry now</button>
            </span>
          )}
        </div>
      )}

      <div className="controls-container">
        <LiveMap
          ref={mapRef}
          vesselsData={displayData}
          tails={isHistoryMode ? historyTails : tails}
          trackLengthMax={trackLengthMax}
          legMarkers={legMarkers}
          activeBoatId={activeBoatId}
          followedBoatId={followedBoatId}
          onBoatClick={handleBoatClick}
          onClearActive={handleClearActive}
          isHistoryMode={isHistoryMode}
          controlsOpen={controlsOpen}
          onToggleControls={onToggleControls}
        />
        <BoatPanel
          crews={crews}
          vesselsData={displayData}
          legMarkers={legMarkers}
          activeBoatId={activeBoatId}
          followedBoatId={followedBoatId}
          collapsed={panelCollapsed}
          onToggleCollapsed={onTogglePanel}
          onFocusBoat={handleFocusBoat}
          onActivate={(id) => setActiveBoatId(id)}
        />
      </div>

      {lastUpdated && !error && !isHistoryMode && <div className="live-dot" />}

      {followedBoatId != null && (() => {
        const crew = crews.find((c) => c.id === followedBoatId);
        return (
          <div className="follow-indicator" onClick={handleStopFollow}>
            <span className="follow-indicator__dot" />
            Following {crew?.name ?? `#${followedBoatId}`} — tap to stop
          </div>
        );
      })()}

      <HistorySlider
        startTime={legStartTime}
        endTime={nowTime}
        currentTime={selectedTime}
        onTimeChange={setSelectedTime}
      />
    </div>
  );
};
