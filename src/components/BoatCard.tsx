import { X } from "lucide-react";
import type { Crew } from "../hooks/useEventConfig";
import type { VesselDataPoint } from "../types/tripData";
import { formatDistanceNm } from "../hooks/useFleetStats";
import { getColorBySpeed } from "../utils/wind";
import { now as raceNow } from "../utils/clock";

interface BoatCardProps {
  crew: Crew;
  data: VesselDataPoint | undefined;
  dtf: number | undefined;
  position: number | undefined;
  following: boolean;
  highlighted: boolean;
  isHistoryMode: boolean;
  onToggleFollow: () => void;
  onToggleHighlight: () => void;
  onClose: () => void;
}

const DASH = "–";

function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}

/** Live: "2 min ago"; history: the time of the fix. */
function fixLabel(time: number | undefined, isHistoryMode: boolean): string {
  if (time == null) return DASH;
  if (isHistoryMode) return new Date(time * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const minutes = Math.max(0, Math.round((raceNow() / 1000 - time) / 60));
  return minutes < 1 ? "now" : `${minutes} min ago`;
}

/** Compact details for one boat, shown in the phone sheet. */
export default function BoatCard({
  crew, data, dtf, position, following, highlighted, isHistoryMode, onToggleFollow, onToggleHighlight, onClose,
}: BoatCardProps) {
  const num = (v: number | undefined, digits: number, unit: string) => (v == null ? DASH : `${v.toFixed(digits)}${unit}`);

  return (
    <div className="boat-detail" style={{ borderTopColor: crew.track_color }}>
      <div className="boat-detail__header">
        <span className="boat-card__dot" style={{ backgroundColor: crew.track_color }} />
        <strong className="boat-detail__title">#{crew.start_number} {crew.name}</strong>
        <button className="boat-detail__close" onClick={onClose} aria-label="Back to the boat list">
          <X size={18} />
        </button>
      </div>
      {crew.description && <div className="boat-detail__desc">{crew.description}</div>}
      <div className="boat-detail__stats">
        <div className="boat-detail__stat"><b>{num(data?.sog, 1, " kn")}</b><span>speed</span></div>
        <div className="boat-detail__stat"><b>{dtf == null ? DASH : formatDistanceNm(dtf)}</b><span>to finish</span></div>
        <div className="boat-detail__stat"><b>{position == null ? DASH : ordinal(position)}</b><span>place</span></div>
        <div className="boat-detail__stat">
          <b style={data?.tws != null ? { color: getColorBySpeed(data.tws) } : undefined}>{num(data?.tws, 1, " kn")}</b>
          <span>wind</span>
        </div>
        <div className="boat-detail__stat"><b>{num(data?.cog, 0, "°")}</b><span>course</span></div>
        <div className="boat-detail__stat"><b>{num(data?.twa == null ? undefined : Math.abs(data.twa), 0, "°")}</b><span>wind angle</span></div>
      </div>
      <div className="boat-detail__fix">Last fix: {fixLabel(data?.time, isHistoryMode)}</div>
      <div className="boat-detail__actions">
        <button className={`boat-detail__follow ${following ? "boat-detail__follow--on" : ""}`} onClick={onToggleFollow}>
          {following ? "Stop following" : "Follow"}
        </button>
        <button
          className={`boat-detail__star ${highlighted ? "boat-detail__star--active" : ""}`}
          onClick={onToggleHighlight}
        >
          {highlighted ? "★ Highlighted" : "☆ Highlight"}
        </button>
      </div>
    </div>
  );
}
