import { useCallback, useEffect, useRef, useState } from "react";
import { VesselDataPoint } from "../types/tripData";
import { Crew, useEventConfig } from "../hooks/useEventConfig";
import { getColorBySpeed } from "../utils/wind";
import { OUR_BOAT } from "../config";

interface BoatPanelProps {
  crews: Crew[];
  vesselsData: Record<string, VesselDataPoint>;
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
  activeBoatId,
  followedBoatId,
  collapsed,
  onToggleCollapsed,
  onFocusBoat,
  onActivate,
}: BoatPanelProps) => {
  const { highlightedCrews, toggleHighlight } = useEventConfig();
  const [search, setSearch] = useState("");
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

  if (crews.length === 0) return null;

  // Sort: highlighted first, then rest; within each group sort by start_number
  const sortedCrews = [...crews].sort((a, b) => {
    const aHighlighted = highlightedCrews.has(a.id) ? 0 : 1;
    const bHighlighted = highlightedCrews.has(b.id) ? 0 : 1;
    if (aHighlighted !== bHighlighted) return aHighlighted - bHighlighted;
    return (a.start_number ?? 0) - (b.start_number ?? 0);
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
      <div className="boat-panel__list">
        {filteredCrews.map((crew, i) => {
          const data = vesselsData[String(crew.id)];
          const isOurs = crew.name === OUR_BOAT;
          const isActive = crew.id === activeBoatId;
          const showDivider = highlightedCount > 0 && i === highlightedCount;

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
                      {data.tws != null && (
                        <span style={{ color: getColorBySpeed(data.tws) }}>
                          {data.tws.toFixed(1)} kn wind
                        </span>
                      )}
                      {data.hdg != null && <span>{data.hdg.toFixed(0)}°</span>}
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
