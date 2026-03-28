import { useEffect, useState } from "react";
import { VesselDataPoint } from "../types/tripData";
import { Crew, useEventConfig } from "../hooks/useEventConfig";
import { getColorBySpeed } from "../utils/wind";
import { OUR_BOAT } from "../config";

interface BoatPanelProps {
  crews: Crew[];
  vesselsData: Record<string, VesselDataPoint>;
  selectedBoatIds: Set<number>;
  activeBoatId: number | null;
  onDismiss: (boatId: number) => void;
  onDismissAll: () => void;
  onFocusBoat: (boatId: number) => void;
  onActivate: (boatId: number) => void;
}

const BoatPanel = ({
  crews,
  vesselsData,
  selectedBoatIds,
  activeBoatId,
  onDismiss,
  onDismissAll,
  onFocusBoat,
  onActivate,
}: BoatPanelProps) => {
  const { highlightedCrews, toggleHighlight } = useEventConfig();
  const [hidden, setHidden] = useState(
    () => localStorage.getItem("boatPanelHidden") === "true"
  );

  useEffect(() => {
    localStorage.setItem("boatPanelHidden", String(hidden));
  }, [hidden]);

  if (selectedBoatIds.size === 0) return null;

  if (hidden) {
    return (
      <div className="boat-panel">
        <button
          className="boat-panel__toggle"
          onClick={() => setHidden(false)}
        >
          Show boats ({selectedBoatIds.size})
        </button>
      </div>
    );
  }

  const selectedCrews = crews.filter((c) => selectedBoatIds.has(c.id));

  return (
    <div className="boat-panel">
      <div className="boat-panel__toolbar">
        <button
          className="boat-panel__toggle"
          onClick={() => setHidden(true)}
        >
          Hide
        </button>
        <button className="boat-panel__close-all" onClick={onDismissAll}>
          Close all
        </button>
      </div>
      {selectedCrews.map((crew) => {
        const data = vesselsData[String(crew.id)];
        const isOurs = crew.name === OUR_BOAT;

        return (
          <div
            key={crew.id}
            className={`boat-card ${isOurs ? "boat-card--ours" : ""} ${crew.id === activeBoatId ? "boat-card--active" : ""}`}
            style={{ borderLeftColor: crew.track_color }}
          >
            <div className="boat-card__body" onClick={() => { onActivate(crew.id); onFocusBoat(crew.id); }}>
              <div className="boat-card__header">
                <span
                  className="boat-card__dot"
                  style={{ backgroundColor: crew.track_color }}
                />
                <strong>{crew.name}</strong>
                <span className="boat-card__number">#{crew.start_number}</span>
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
            <div className="boat-card__actions">
              <button
                className={`boat-card__star ${highlightedCrews.has(crew.id) ? "boat-card__star--active" : ""}`}
                onClick={() => toggleHighlight(crew.id)}
                title={highlightedCrews.has(crew.id) ? "Remove highlight" : "Highlight"}
              >
                {highlightedCrews.has(crew.id) ? "\u2605" : "\u2606"}
              </button>
              <button
                className="boat-card__close"
                onClick={() => onDismiss(crew.id)}
                title="Close"
              >
                ×
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default BoatPanel;
