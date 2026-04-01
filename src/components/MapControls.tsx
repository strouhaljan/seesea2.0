import { ColorMode } from "../types/map";
import { MapTheme } from "../utils/mapConfig";
import { WindModel } from "../utils/windGrid";

const FUTURE_STEPS = [30, 60, 90, 120, 150, 180];
const TRAIL_STEPS = [15, 30, 60, 120, 180];

interface MapControlsProps {
  controlsOpen: boolean;
  colorMode: ColorMode;
  setColorMode: (mode: ColorMode) => void;
  showOnlyHighlighted: boolean;
  setShowOnlyHighlighted: (fn: (prev: boolean) => boolean) => void;
  futureMinutes: number;
  setFutureMinutes: (v: number) => void;
  trailMinutes: number;
  setTrailMinutes: (v: number) => void;
  trackLengthMax: number;
  showWind: boolean;
  setShowWind: (fn: (prev: boolean) => boolean) => void;
  windModel: WindModel;
  setWindModel: (m: WindModel) => void;
  blendBoats: boolean;
  setBlendBoats: (fn: (prev: boolean) => boolean) => void;
  mapTheme: MapTheme;
  setMapTheme: (t: MapTheme) => void;
  isHistoryMode: boolean;
}

export const MapControls = ({
  controlsOpen,
  colorMode, setColorMode,
  showOnlyHighlighted, setShowOnlyHighlighted,
  futureMinutes, setFutureMinutes,
  trailMinutes, setTrailMinutes,
  trackLengthMax,
  showWind, setShowWind,
  windModel, setWindModel,
  blendBoats, setBlendBoats,
  mapTheme, setMapTheme,
  isHistoryMode,
}: MapControlsProps) => (
  <div className="controls-stack">
    <div className={`controls-panel ${controlsOpen ? "" : "controls-panel--hidden"}`}>
      <div className="controls-panel__row">
        <span className="controls-panel__label">SeeSea</span>
        <label className="toggle-switch">
          <input
            type="checkbox"
            checked={colorMode === "wind"}
            onChange={() => setColorMode(colorMode === "wind" ? "seesea" : "wind")}
          />
          <span className="toggle-switch__slider" />
        </label>
        <span className="controls-panel__label">Wind</span>
      </div>
      <div className="controls-panel__row">
        <span className="controls-panel__label">Highlighted only</span>
        <label className="toggle-switch">
          <input
            type="checkbox"
            checked={showOnlyHighlighted}
            onChange={() => setShowOnlyHighlighted((prev) => !prev)}
          />
          <span className="toggle-switch__slider" />
        </label>
      </div>
      <div className="controls-panel__row controls-panel__row--column">
        <span className="controls-panel__label">
          Future position{futureMinutes > 0 ? `: ${futureMinutes} min` : ""}
        </span>
        <input
          type="range"
          className="future-slider"
          min={0}
          max={180}
          step={30}
          value={futureMinutes}
          onChange={(e) => setFutureMinutes(parseInt(e.target.value, 10))}
        />
        <div className="future-slider__ticks">
          <span>Off</span>
          {FUTURE_STEPS.map((m) => (
            <span key={m}>{m}m</span>
          ))}
        </div>
      </div>
      <div className="controls-panel__row controls-panel__row--column">
        <span className="controls-panel__label">
          Trail{trailMinutes > 0 ? `: ${trailMinutes >= 60 ? `${trailMinutes / 60}h` : `${trailMinutes} min`}` : ""}
        </span>
        <input
          type="range"
          className="future-slider"
          min={0}
          max={trackLengthMax / 60}
          step={15}
          value={trailMinutes}
          onChange={(e) => setTrailMinutes(parseInt(e.target.value, 10))}
        />
        <div className="future-slider__ticks">
          <span>Off</span>
          {TRAIL_STEPS.filter((m) => m <= trackLengthMax / 60).map((m) => (
            <span key={m}>{m >= 60 ? `${m / 60}h` : `${m}m`}</span>
          ))}
        </div>
      </div>
      <div className="controls-panel__divider" />
      <div className={`controls-panel__row${isHistoryMode ? " controls-panel__row--disabled" : ""}`}>
        <span className="controls-panel__label">Wind overlay</span>
        <label className="toggle-switch">
          <input
            type="checkbox"
            checked={showWind}
            disabled={isHistoryMode}
            onChange={() => setShowWind((prev) => !prev)}
          />
          <span className="toggle-switch__slider" />
        </label>
      </div>
      {showWind && !isHistoryMode && (
        <>
          <div className="controls-panel__row">
            <label className="controls-panel__radio">
              <input
                type="radio"
                name="windModel"
                checked={windModel === "icon_2i"}
                onChange={() => setWindModel("icon_2i")}
              />
              ICON-2I
            </label>
            <label className="controls-panel__radio">
              <input
                type="radio"
                name="windModel"
                checked={windModel === "ecmwf"}
                onChange={() => setWindModel("ecmwf")}
              />
              ECMWF
            </label>
          </div>
          <div className="controls-panel__row">
            <span className="controls-panel__label">Blend boats</span>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={blendBoats}
                onChange={() => setBlendBoats((prev) => !prev)}
              />
              <span className="toggle-switch__slider" />
            </label>
          </div>
        </>
      )}
      <div className="controls-panel__divider" />
      <div className="controls-panel__row">
        <span className="controls-panel__label">Dark</span>
        <label className="toggle-switch">
          <input
            type="checkbox"
            checked={mapTheme === "light"}
            onChange={() => setMapTheme(mapTheme === "dark" ? "light" : "dark")}
          />
          <span className="toggle-switch__slider" />
        </label>
        <span className="controls-panel__label">Light</span>
      </div>
    </div>
  </div>
);
