import { useCallback, useEffect, useRef, useState } from "react";
import { VesselDataPoint } from "../types/tripData";
import { Crew, useEventConfig } from "../hooks/useEventConfig";
import { FleetStats, formatDistanceNm } from "../hooks/useFleetStats";
import { getColorBySpeed } from "../utils/wind";
import { OUR_BOAT } from "../config";

type SortMode = "number" | "position" | "wind";

interface BoatListProps {
  crews: Crew[];
  vesselsData: Record<string, VesselDataPoint>;
  stats: FleetStats;
  activeBoatId: number | null;
  followedBoatId: number | null;
  onSelect: (crewId: number) => void;
}

/** Search, sort and boat cards — shown in the desktop side panel and the phone sheet. */
const BoatList = ({ crews, vesselsData, stats, activeBoatId, followedBoatId, onSelect }: BoatListProps) => {
  const { highlightedCrews, toggleHighlight } = useEventConfig();
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>(
    () => (localStorage.getItem("boatPanelSort") as SortMode) || "number",
  );
  const activeCardRef = useRef<HTMLDivElement>(null);

  // Scroll active vessel into view
  useEffect(() => {
    if (activeBoatId != null && activeCardRef.current) {
      activeCardRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [activeBoatId]);

  const { dtf: dtfMap, position: positionMap } = stats;
  const canSortByPosition = stats.hasFinish && dtfMap.size > 0;

  const cycleSortMode = useCallback(() => {
    const sortModes: SortMode[] = canSortByPosition ? ["number", "position", "wind"] : ["number", "wind"];
    setSortMode((prev) => {
      const next = sortModes[(sortModes.indexOf(prev) + 1) % sortModes.length];
      localStorage.setItem("boatPanelSort", next);
      return next;
    });
  }, [canSortByPosition]);

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
      const aTws = vesselsData[String(a.id)]?.tws;
      const bTws = vesselsData[String(b.id)]?.tws;
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
    <div className="boat-list">
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
            <button className="boat-panel__search-clear" onClick={() => setSearch("")} title="Clear search">
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
                <div className="boat-card__body" onClick={() => onSelect(crew.id)}>
                  <div className="boat-card__header">
                    {position != null && <span className="boat-card__position">{position}</span>}
                    <span className="boat-card__dot" style={{ backgroundColor: crew.track_color }} />
                    <strong>{crew.name}</strong>
                    <span className="boat-card__number">#{crew.start_number}</span>
                    {crew.id === followedBoatId && <span className="boat-card__follow-badge">following</span>}
                  </div>
                  {crew.description && <div className="boat-card__desc">{crew.description}</div>}
                  {data ? (
                    <div className="boat-card__stats">
                      <span>{data.sog?.toFixed(1) ?? "?"} kn</span>
                      {dtf != null && <span className="boat-card__dtf">{formatDistanceNm(dtf)} DTF</span>}
                      {data.tws != null && (
                        <span style={{ color: getColorBySpeed(data.tws) }}>{data.tws.toFixed(1)} kn wind</span>
                      )}
                    </div>
                  ) : (
                    <div className="boat-card__stats boat-card__stats--empty">No data</div>
                  )}
                </div>
                <button
                  className={`boat-card__star ${highlightedCrews.has(crew.id) ? "boat-card__star--active" : ""}`}
                  onClick={() => toggleHighlight(crew.id)}
                  title={highlightedCrews.has(crew.id) ? "Remove highlight" : "Highlight"}
                >
                  {highlightedCrews.has(crew.id) ? "★" : "☆"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default BoatList;
