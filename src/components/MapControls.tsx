import type { MapControlsState } from "../hooks/useMapControls";
import type { EventLeg } from "../hooks/useEventConfig";
import SettingsPanel from "./SettingsPanel";

interface MapControlsProps {
  controlsOpen: boolean;
  controls: MapControlsState;
  legs: EventLeg[];
  activeLegId: number | null;
  trackLengthMax: number;
  isHistoryMode: boolean;
}

/** Desktop: settings as a floating panel in the bottom-right corner. */
export const MapControls = ({ controlsOpen, ...settingsProps }: MapControlsProps) => (
  <div className="controls-stack">
    <div className={`controls-panel ${controlsOpen ? "" : "controls-panel--hidden"}`}>
      <SettingsPanel {...settingsProps} />
    </div>
  </div>
);
