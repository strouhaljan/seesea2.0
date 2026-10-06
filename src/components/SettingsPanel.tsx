import type { MapControlsState } from "../hooks/useMapControls";
import type { EventLeg } from "../hooks/useEventConfig";
import { legsByStart } from "../utils/legs";

const FUTURE_STEPS = [30, 60, 90, 120, 150, 180];
const TRAIL_STEPS = [15, 30, 60, 120, 180];

/** "15m", "1h", "1½h" … */
function minutesLabel(m: number): string {
  if (m < 60) return `${m}m`;
  const h = m / 60;
  return Number.isInteger(h) ? `${h}h` : `${Math.floor(h)}½h`;
}

interface SegmentedProps<T extends string | number> {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}

/** Row of buttons for a setting with a few fixed values. */
function Segmented<T extends string | number>({ label, options, value, onChange }: SegmentedProps<T>) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={`segmented__option ${o.value === value ? "segmented__option--on" : ""}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Switch({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled?: boolean; onChange: () => void }) {
  return (
    <label className={`settings__row ${disabled ? "settings__row--disabled" : ""}`}>
      <span>{label}</span>
      <span className="toggle-switch">
        <input type="checkbox" checked={checked} disabled={disabled} onChange={onChange} />
        <span className="toggle-switch__slider" />
      </span>
    </label>
  );
}

interface SettingsPanelProps {
  controls: MapControlsState;
  legs: EventLeg[];
  activeLegId: number | null;
  trackLengthMax: number;
  isHistoryMode: boolean;
}

/** All map settings, grouped Race · Boats · Map · Appearance (desktop panel and phone sheet). */
export default function SettingsPanel({ controls, legs, activeLegId, trackLengthMax, isHistoryMode }: SettingsPanelProps) {
  const trailOptions = [
    { value: 0, label: "Off" },
    ...TRAIL_STEPS.filter((m) => m <= trackLengthMax / 60).map((m) => ({ value: m, label: minutesLabel(m) })),
  ];
  const futureOptions = [{ value: 0, label: "Off" }, ...FUTURE_STEPS.map((m) => ({ value: m, label: minutesLabel(m) }))];

  return (
    <div className="settings">
      {legs.length > 1 && (
        <section className="settings__section">
          <h4 className="settings__heading">Race</h4>
          <label className="settings__row">
            <span>Leg</span>
            <select
              className="controls-panel__select settings__select"
              value={controls.selectedLegId ?? "auto"}
              onChange={(e) => {
                const val = e.target.value;
                controls.setSelectedLegId(val === "auto" ? null : parseInt(val, 10));
              }}
            >
              <option value="auto">
                Auto{activeLegId ? ` (${legs.find((l) => l.id === activeLegId)?.name ?? ""})` : ""}
              </option>
              {legsByStart(legs).map((leg) => (
                <option key={leg.id} value={leg.id}>{leg.name}</option>
              ))}
            </select>
          </label>
        </section>
      )}

      <section className="settings__section">
        <h4 className="settings__heading">Boats</h4>
        <div className="settings__row">
          <span>Colour by</span>
          <Segmented
            label="Colour by"
            options={[{ value: "seesea", label: "Crew" }, { value: "wind", label: "Wind" }]}
            value={controls.colorMode}
            onChange={controls.setColorMode}
          />
        </div>
        <Switch
          label="Only highlighted ★"
          checked={controls.showOnlyHighlighted}
          onChange={() => controls.setShowOnlyHighlighted((prev) => !prev)}
        />
      </section>

      <section className="settings__section">
        <h4 className="settings__heading">Map</h4>
        <div className="settings__field">
          <span>Trail</span>
          <Segmented label="Trail" options={trailOptions} value={controls.trailMinutes} onChange={controls.setTrailMinutes} />
        </div>
        <div className="settings__field">
          <span>Future position</span>
          <Segmented label="Future position" options={futureOptions} value={controls.futureMinutes} onChange={controls.setFutureMinutes} />
        </div>
        <Switch
          label={isHistoryMode ? "Wind overlay (live only)" : "Wind overlay"}
          checked={controls.showWind}
          disabled={isHistoryMode}
          onChange={() => controls.setShowWind((prev) => !prev)}
        />
        {controls.showWind && !isHistoryMode && (
          <div className="settings__sub">
            <div className="settings__row">
              <span>Model</span>
              <Segmented
                label="Wind model"
                options={[{ value: "icon_2i", label: "ICON-2I" }, { value: "ecmwf", label: "ECMWF" }]}
                value={controls.windModel}
                onChange={controls.setWindModel}
              />
            </div>
            <Switch
              label="Correct with boats' wind"
              checked={controls.blendBoats}
              onChange={() => controls.setBlendBoats((prev) => !prev)}
            />
          </div>
        )}
      </section>

      <section className="settings__section">
        <h4 className="settings__heading">Appearance</h4>
        <div className="settings__row">
          <span>Map theme</span>
          <Segmented
            label="Map theme"
            options={[{ value: "dark", label: "Dark" }, { value: "light", label: "Light" }]}
            value={controls.mapTheme}
            onChange={controls.setMapTheme}
          />
        </div>
      </section>
    </div>
  );
}
