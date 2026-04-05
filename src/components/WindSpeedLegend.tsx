import { WIND_SPEED_COLORS, getColorBySpeed } from "../utils/wind";

const GRADIENT_STEPS = 64;

export const WindSpeedLegend = () => {
  const maxSpeed = WIND_SPEED_COLORS[WIND_SPEED_COLORS.length - 1].threshold;

  // Build a CSS linear-gradient from sampled colors
  const stops = Array.from({ length: GRADIENT_STEPS + 1 }, (_, i) => {
    const speed = (i / GRADIENT_STEPS) * maxSpeed;
    const pct = (i / GRADIENT_STEPS) * 100;
    return `${getColorBySpeed(speed)} ${pct.toFixed(1)}%`;
  }).join(", ");

  // Labels at each threshold (skip 0)
  const labels = WIND_SPEED_COLORS.filter((s) => s.threshold > 0);

  return (
    <div className="wind-legend">
      <span className="wind-legend__label wind-legend__label--unit">kn</span>
      <div className="wind-legend__bar-wrap">
        <div
          className="wind-legend__bar"
          style={{ background: `linear-gradient(to right, ${stops})` }}
        />
        <div className="wind-legend__ticks">
          {labels.map((s) => (
            <span
              key={s.threshold}
              className="wind-legend__tick"
              style={{ left: `${(s.threshold / maxSpeed) * 100}%` }}
            >
              {s.threshold}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};
