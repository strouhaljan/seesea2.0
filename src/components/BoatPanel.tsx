import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { VesselDataPoint } from "../types/tripData";
import { Crew, useEventConfig } from "../hooks/useEventConfig";
import { LegMarker } from "../hooks/useLegMarkers";
import { getColorBySpeed } from "../utils/wind";
import { distanceNm } from "../utils/distance";
import { OUR_BOAT } from "../config";

type SortMode = "number" | "position" | "wind";

interface BoatPanelProps {
  crews: Crew[];
  vesselsData: Record<string, VesselDataPoint>;
  legMarkers: LegMarker[];
  activeBoatId: number | null;
  followedBoatId: number | null;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onFocusBoat: (boatId: number) => void;
  onActivate: (boatId: number) => void;
}

const SWIPE_THRESHOLD = 50;
const EDGE_ZONE = 30;

const BoatPanel = ({
  crews,
  vesselsData,
  legMarkers,
  activeBoatId,
  followedBoatId,
  collapsed,
  onToggleCollapsed,
  onFocusBoat,
  onActivate,
}: BoatPanelProps) => {
  const { highlightedCrews, toggleHighlight } = useEventConfig();
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>(
    () => (localStorage.getItem("boatPanelSort") as SortMode) || "number",
  );
  const activeCardRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const touchRef = useRef<{ startX: number; startY: number; isEdge: boolean } | null>(null);

  // Scroll active vessel into view
  useEffect(() => {
    if (activeBoatId != null && activeCardRef.current) {
      activeCardRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [activeBoatId]);

  // Edge swipe to open: listen on document
  const handleDocTouchStart = useCallback((e: TouchEvent) => {
    const touch = e.touches[0];
    if (touch.clientX <= EDGE_ZONE) {
      touchRef.current = { startX: touch.clientX, startY: touch.clientY, isEdge: true };
    }
  }, []);

  const handleDocTouchEnd = useCallback((e: TouchEvent) => {
    const ref = touchRef.current;
    if (!ref?.isEdge) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - ref.startX;
    const dy = Math.abs(touch.clientY - ref.startY);
    touchRef.current = null;
    if (dx > SWIPE_THRESHOLD && dx > dy && collapsed) {
      onToggleCollapsed();
    }
  }, [collapsed, onToggleCollapsed]);

  useEffect(() => {
    document.addEventListener("touchstart", handleDocTouchStart, { passive: true });
    document.addEventListener("touchend", handleDocTouchEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", handleDocTouchStart);
      document.removeEventListener("touchend", handleDocTouchEnd);
    };
  }, [handleDocTouchStart, handleDocTouchEnd]);

  // Swipe left on panel to close
  const handlePanelTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchRef.current = { startX: touch.clientX, startY: touch.clientY, isEdge: false };
  }, []);

  const handlePanelTouchEnd = useCallback((e: React.TouchEvent) => {
    const ref = touchRef.current;
    if (!ref || ref.isEdge) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - ref.startX;
    const dy = Math.abs(touch.clientY - ref.startY);
    touchRef.current = null;
    if (dx < -SWIPE_THRESHOLD && Math.abs(dx) > dy && !collapsed) {
      onToggleCollapsed();
    }
  }, [collapsed, onToggleCollapsed]);

  // Compute distance to finish for each vessel that has data
  const finishMark = useMemo(
    () => legMarkers.find((m) => m.marker_type === "finish"),
    [legMarkers],
  );

  const dtfMap = useMemo(() => {
    const map = new Map<number, number>();
    if (!finishMark) return map;
    const finishCoords: [number, number] = [finishMark.lon, finishMark.lat];
    for (const crew of crews) {
      const data = vesselsData[String(crew.id)];
      if (data?.coords) {
        map.set(crew.id, distanceNm(data.coords, finishCoords));
      }
    }
    return map;
  }, [crews, vesselsData, finishMark]);

  // Build position map (1-based ranking by distance to finish, ascending)
  const positionMap = useMemo(() => {
    const map = new Map<number, number>();
    const entries = [...dtfMap.entries()].sort((a, b) => a[1] - b[1]);
    entries.forEach(([crewId], i) => map.set(crewId, i + 1));
    return map;
  }, [dtfMap]);

  const canSortByPosition = finishMark != null && dtfMap.size > 0;

  const sortModes: SortMode[] = canSortByPosition
    ? ["number", "position", "wind"]
    : ["number", "wind"];

  const cycleSortMode = useCallback(() => {
    setSortMode((prev) => {
      const idx = sortModes.indexOf(prev);
      const next = sortModes[(idx + 1) % sortModes.length];
      localStorage.setItem("boatPanelSort", next);
      return next;
    });
  }, [sortModes]);

  if (crews.length === 0) return null;

  // Sort: highlighted first, then by chosen sort mode
  const sortedCrews = [...crews].sort((a, b) => {
    const aHighlighted = highlightedCrews.has(a.id) ? 0 : 1;
    const bHighlighted = highlightedCrews.has(b.id) ? 0 : 1;
    if (aHighlighted !== bHighlighted) return aHighlighted - bHighlighted;

    const byNumber = () => (a.start_number ?? 0) - (b.start_number ?? 0);

    if (sortMode === "position" && canSortByPosition) {
      const aDtf = dtfMap.get(a.id);
      const bDtf = dtfMap.get(b.id);
      if (aDtf == null && bDtf == null) return byNumber();
      if (aDtf == null) return 1;
      if (bDtf == null) return -1;
      return aDtf - bDtf;
    }

    if (sortMode === "wind") {
      const aData = vesselsData[String(a.id)];
      const bData = vesselsData[String(b.id)];
      const aTws = aData?.tws;
      const bTws = bData?.tws;
      if (aTws == null && bTws == null) return byNumber();
      if (aTws == null) return 1;
      if (bTws == null) return -1;
      return bTws - aTws; // highest wind first
    }

    return byNumber();
  });

  const filteredCrews = search
    ? sortedCrews.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))
    : sortedCrews;

  const highlightedCount = filteredCrews.filter((c) => highlightedCrews.has(c.id)).length;

  return (
    <div
      ref={panelRef}
      className={`boat-panel ${collapsed ? "boat-panel--collapsed" : ""}`}
      onTouchStart={handlePanelTouchStart}
      onTouchEnd={handlePanelTouchEnd}
    >
      <div className="boat-panel__search-wrap">
        <div className="boat-panel__search-input-wrap">
          <input
            className="boat-panel__search"
            type="text"
            placeholder="Search vessels…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              className="boat-panel__search-clear"
              onClick={() => setSearch("")}
              title="Clear search"
            >
              ×
            </button>
          )}
        </div>
        <button
          className="boat-panel__sort-toggle"
          onClick={cycleSortMode}
          title={
            sortMode === "number" ? "Sorted by sail number"
            : sortMode === "position" ? "Sorted by race position"
            : "Sorted by wind speed"
          }
        >
          {sortMode === "number" && (
            <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
              <text x="1" y="12" fontSize="11" fontWeight="700" fontFamily="system-ui">#</text>
            </svg>
          )}
          {sortMode === "position" && (
            <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
              <rect x="1" y="6" width="4" height="9" rx=".5" opacity=".7" />
              <rect x="6" y="2" width="4" height="13" rx=".5" />
              <rect x="11" y="9" width="4" height="6" rx=".5" opacity=".5" />
            </svg>
          )}
          {sortMode === "wind" && (
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M1 8h10c1.5 0 2.5-1 2.5-2.5S12.5 3 11 3c-1 0-1.8.8-1.8 1.8" />
              <path d="M1 12h7c1.2 0 2 .8 2 2s-.8 2-2 2c-.8 0-1.4-.6-1.4-1.4" />
            </svg>
          )}
        </button>
      </div>
      <div className="boat-panel__list">
        {filteredCrews.map((crew, i) => {
          const data = vesselsData[String(crew.id)];
          const isOurs = crew.name === OUR_BOAT;
          const isActive = crew.id === activeBoatId;
          const showDivider = highlightedCount > 0 && i === highlightedCount;
          const position = positionMap.get(crew.id);
          const dtf = dtfMap.get(crew.id);

          return (
            <div key={crew.id}>
              {showDivider && <div className="boat-panel__divider" />}
              <div
                ref={isActive ? activeCardRef : undefined}
                className={`boat-card ${isOurs ? "boat-card--ours" : ""} ${isActive ? "boat-card--active" : ""}`}
                style={{ borderLeftColor: crew.track_color }}
              >
                <div
                  className="boat-card__body"
                  onClick={() => {
                    onActivate(crew.id);
                    onFocusBoat(crew.id);
                  }}
                >
                  <div className="boat-card__header">
                    {position != null && (
                      <span className="boat-card__position">{position}</span>
                    )}
                    <span
                      className="boat-card__dot"
                      style={{ backgroundColor: crew.track_color }}
                    />
                    <strong>{crew.name}</strong>
                    <span className="boat-card__number">#{crew.start_number}</span>
                    {crew.id === followedBoatId && (
                      <span className="boat-card__follow-badge">following</span>
                    )}
                  </div>
                  {crew.description && (
                    <div className="boat-card__desc">{crew.description}</div>
                  )}
                  {data ? (
                    <div className="boat-card__stats">
                      <span>{data.sog?.toFixed(1) ?? "?"} kn</span>
                      {dtf != null && (
                        <span className="boat-card__dtf">
                          {dtf < 1 ? `${(dtf * 1852).toFixed(0)} m` : `${dtf.toFixed(1)} nm`} DTF
                        </span>
                      )}
                      {data.tws != null && (
                        <span style={{ color: getColorBySpeed(data.tws) }}>
                          {data.tws.toFixed(1)} kn wind
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="boat-card__stats boat-card__stats--empty">
                      No data
                    </div>
                  )}
                </div>
                <button
                  className={`boat-card__star ${highlightedCrews.has(crew.id) ? "boat-card__star--active" : ""}`}
                  onClick={() => toggleHighlight(crew.id)}
                  title={highlightedCrews.has(crew.id) ? "Remove highlight" : "Highlight"}
                >
                  {highlightedCrews.has(crew.id) ? "\u2605" : "\u2606"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default BoatPanel;
