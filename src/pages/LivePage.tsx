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
import { now as raceNow } from "../utils/clock";
import { pickCurrentLeg } from "../utils/legs";
import ReplayBadge from "../components/ReplayBadge";
import { useFleetStats } from "../hooks/useFleetStats";
import BoatList from "../components/BoatList";
import BoatCard from "../components/BoatCard";
import BottomSheet from "../components/BottomSheet";
import { SheetSnap, sheetHeight } from "../utils/sheet";

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
  isPhone: boolean;
  sheetSnap: SheetSnap;
  onSheetSnapChange: (snap: SheetSnap) => void;
  onCloseControls: () => void;
}

export const LivePage = ({
  panelCollapsed, onTogglePanel, controlsOpen, isPhone, sheetSnap, onSheetSnapChange, onCloseControls,
}: LivePageProps) => {
  const [liveData, setLiveData] = useState<Record<string, VesselDataPoint>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const { eventId, crews, legs, slug, highlightedCrews, toggleHighlight } = useEventConfig();
  const legKey = `selectedLegId:${slug}`;
  const mapRef = useRef<LiveMapHandle>(null);

  // Auto-detected leg by race time, re-picked every minute so a multi-day event
  // moves on to the next leg without a reload
  const [legClock, setLegClock] = useState(raceNow);
  useEffect(() => {
    const id = setInterval(() => setLegClock(raceNow()), 60_000);
    return () => clearInterval(id);
  }, []);
  const autoLeg = useMemo(() => pickCurrentLeg(legs, legClock), [legs, legClock]);

  // Allow manual leg override from settings
  const selectedLegId = useMemo(() => {
    const saved = localStorage.getItem(legKey);
    return saved ? parseInt(saved, 10) : null;
  }, [legKey]);
  const [manualLegId, setManualLegId] = useState<number | null>(selectedLegId);

  // Sync with localStorage changes from MapControls
  useEffect(() => {
    const handler = () => {
      const saved = localStorage.getItem(legKey);
      setManualLegId(saved ? parseInt(saved, 10) : null);
    };
    window.addEventListener("selectedLegChanged", handler);
    return () => window.removeEventListener("selectedLegChanged", handler);
  }, [legKey]);

  const activeLeg = useMemo(() => {
    if (manualLegId !== null) {
      const manual = legs.find((l) => l.id === manualLegId);
      if (manual) return manual;
    }
    return autoLeg;
  }, [manualLegId, legs, autoLeg]);

  const activeLegId = activeLeg?.id ?? null;
  const autoLegId = autoLeg?.id ?? null;
  const legStartTime = activeLeg ? Math.floor(new Date(activeLeg.start).getTime() / 1000) : 0;
  const legEndTime = activeLeg ? Math.floor(new Date(activeLeg.end).getTime() / 1000) : 0;
  const nowTime = Math.floor(raceNow() / 1000);

  const { tails, trackLengthMax } = useTails(eventId, activeLegId);
  const legMarkers = useLegMarkers(eventId, activeLegId);
  const [selectedTime, setSelectedTime] = useState<number | null>(null);
  const [trailMinutes, setTrailMinutes] = useState(
    () => parseInt(localStorage.getItem("trailMinutes") || "0", 10),
  );
  const { historyData, historyTails, historyTimelines } = useHistoryData(eventId, selectedTime, trailMinutes);
  const simTimeRef = useRef<number | null>(null);
  const [activeBoatId, setActiveBoatId] = useState<number | null>(null);
  const [followedBoatId, setFollowedBoatId] = useState<number | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [cardBoatId, setCardBoatId] = useState<number | null>(null);

  // Phones: the sheet, controls and history never cover each other
  const handleSheetSnap = useCallback((snap: SheetSnap) => {
    if (snap === "bar") setCardBoatId(null);
    onSheetSnapChange(snap);
    if (snap !== "bar") {
      onCloseControls();
      setHistoryOpen(false);
    }
  }, [onSheetSnapChange, onCloseControls]);

  const handleHistoryOpen = useCallback((open: boolean) => {
    setHistoryOpen(open);
    if (open && isPhone) {
      onCloseControls();
      onSheetSnapChange("bar");
    }
  }, [isPhone, onCloseControls, onSheetSnapChange]);

  useEffect(() => {
    if (isPhone && controlsOpen) setHistoryOpen(false);
  }, [isPhone, controlsOpen]);

  // Keep centring and following above the sheet
  useEffect(() => {
    mapRef.current?.setBottomPadding(isPhone ? sheetHeight(sheetSnap) : 0);
  }, [isPhone, sheetSnap]);

  // The map registers its click handler once, so read the latest values from refs
  const isPhoneRef = useRef(isPhone);
  isPhoneRef.current = isPhone;
  const closeControlsRef = useRef(onCloseControls);
  closeControlsRef.current = onCloseControls;

  // Sync trailMinutes from localStorage (LiveMap dispatches trailMinutesChanged)
  useEffect(() => {
    const handler = () => setTrailMinutes(parseInt(localStorage.getItem("trailMinutes") || "0", 10));
    window.addEventListener("trailMinutesChanged", handler);
    return () => window.removeEventListener("trailMinutesChanged", handler);
  }, []);

  const isHistoryMode = selectedTime !== null;
  const displayData = isHistoryMode && Object.keys(historyData).length > 0 ? historyData : liveData;
  const stats = useFleetStats(crews, displayData, legMarkers);

  // Phones: tapping a boat (map or list) opens its card and centres it, without following
  const openCard = useCallback((boatId: number) => {
    setActiveBoatId(boatId);
    setCardBoatId(boatId);
    const targetSnap = sheetSnap === "bar" ? "half" : sheetSnap;
    if (targetSnap !== sheetSnap) onSheetSnapChange(targetSnap);
    onCloseControls();
    setHistoryOpen(false);
    const coords = displayData[String(boatId)]?.coords;
    if (coords) mapRef.current?.centerOn(coords, sheetHeight(targetSnap));
  }, [sheetSnap, onSheetSnapChange, onCloseControls, displayData]);

  const closeCard = useCallback(() => {
    setCardBoatId(null);
    setActiveBoatId(null);
  }, []);

  const latestBoatClick = useRef<(boatId: number) => void>(() => {});
  latestBoatClick.current = (boatId: number) => {
    if (isPhone) {
      openCard(boatId);
      return;
    }
    setActiveBoatId(boatId);
    setFollowedBoatId(boatId);
    if (panelCollapsed) onTogglePanel();
  };
  // Stable identity: markers keep the click handler they were created with
  const handleBoatClick = useCallback((boatId: number) => latestBoatClick.current(boatId), []);

  const handleClearActive = useCallback(() => {
    setActiveBoatId(null);
    setFollowedBoatId(null);
    setCardBoatId(null);
    if (isPhoneRef.current) closeControlsRef.current();
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
    <div
      className="map-view live-view"
      style={{ "--sheet-height": `${isPhone ? sheetHeight(sheetSnap) : 0}px` } as React.CSSProperties}
    >
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

      {/* Only until the first poll answers: an event without live boats keeps liveData
          empty, and showing this on every poll made the whole layout flicker */}
      {loading && !lastUpdated && Object.keys(liveData).length === 0 && (
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
          legs={legs}
          activeLegId={autoLegId}
          activeBoatId={activeBoatId}
          followedBoatId={followedBoatId}
          onBoatClick={handleBoatClick}
          onClearActive={handleClearActive}
          isHistoryMode={isHistoryMode}
          historyTimelines={historyTimelines}
          simTimeRef={simTimeRef}
          controlsOpen={controlsOpen}
        />
        {isPhone ? (
          <BottomSheet snap={sheetSnap} onSnapChange={handleSheetSnap}>
            {cardBoatId != null && crews.some((c) => c.id === cardBoatId) ? (
              <BoatCard
                crew={crews.find((c) => c.id === cardBoatId)!}
                data={displayData[String(cardBoatId)]}
                dtf={stats.dtf.get(cardBoatId)}
                position={stats.position.get(cardBoatId)}
                following={followedBoatId === cardBoatId}
                highlighted={highlightedCrews.has(cardBoatId)}
                isHistoryMode={isHistoryMode}
                onToggleFollow={() => setFollowedBoatId((f) => (f === cardBoatId ? null : cardBoatId))}
                onToggleHighlight={() => toggleHighlight(cardBoatId)}
                onClose={closeCard}
              />
            ) : (
              <BoatList
                crews={crews}
                vesselsData={displayData}
                stats={stats}
                activeBoatId={activeBoatId}
                followedBoatId={followedBoatId}
                onSelect={openCard}
              />
            )}
          </BottomSheet>
        ) : (
          <BoatPanel
            crews={crews}
            vesselsData={displayData}
            stats={stats}
            activeBoatId={activeBoatId}
            followedBoatId={followedBoatId}
            collapsed={panelCollapsed}
            onToggleCollapsed={onTogglePanel}
            onSelect={(id) => {
              setActiveBoatId(id);
              handleFocusBoat(id);
            }}
          />
        )}
      </div>

      {lastUpdated && !error && !isHistoryMode && <div className="live-dot" />}
      <ReplayBadge />

      {!isPhone && followedBoatId != null && (() => {
        const crew = crews.find((c) => c.id === followedBoatId);
        return (
          <div
            className={`follow-indicator ${panelCollapsed ? "" : "follow-indicator--beside-panel"}`}
            onClick={handleStopFollow}
          >
            <span className="follow-indicator__dot" />
            Following {crew?.name ?? `#${followedBoatId}`} — tap to stop
          </div>
        );
      })()}

      <HistorySlider
        startTime={legStartTime}
        endTime={legEndTime < nowTime ? legEndTime : nowTime}
        currentTime={selectedTime}
        onTimeChange={setSelectedTime}
        simTimeRef={simTimeRef}
        expanded={historyOpen}
        onExpandedChange={handleHistoryOpen}
      />
    </div>
  );
};
