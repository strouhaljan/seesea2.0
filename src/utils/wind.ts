export const WIND_SPEED_COLORS = [
  { threshold: 0, color: "#4a6a7a" },
  { threshold: 5, color: "#00bfff" },
  { threshold: 10, color: "#0080ff" },
  { threshold: 15, color: "#00ff80" },
  { threshold: 20, color: "#00c000" },
  { threshold: 25, color: "#ffd700" },
  { threshold: 30, color: "#ff8c00" },
  { threshold: 35, color: "#ff4500" },
  { threshold: 40, color: "#ff0000" },
];

const parseHex = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

const toHex = (r: number, g: number, b: number): string =>
  "#" +
  [r, g, b]
    .map((v) =>
      Math.round(Math.max(0, Math.min(255, v)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("");

export const getColorBySpeed = (windSpeed?: number): string => {
  if (!windSpeed || windSpeed <= 0) return WIND_SPEED_COLORS[0].color;

  const last = WIND_SPEED_COLORS[WIND_SPEED_COLORS.length - 1];
  if (windSpeed >= last.threshold) return last.color;

  for (let i = 0; i < WIND_SPEED_COLORS.length - 1; i++) {
    const lo = WIND_SPEED_COLORS[i];
    const hi = WIND_SPEED_COLORS[i + 1];
    if (windSpeed >= lo.threshold && windSpeed < hi.threshold) {
      const t = (windSpeed - lo.threshold) / (hi.threshold - lo.threshold);
      const [r1, g1, b1] = parseHex(lo.color);
      const [r2, g2, b2] = parseHex(hi.color);
      return toHex(r1 + t * (r2 - r1), g1 + t * (g2 - g1), b1 + t * (b2 - b1));
    }
  }
  return WIND_SPEED_COLORS[0].color;
};

export const kmhToKnots = (kmh: number): number => kmh * 0.539957;

export const getDirection = (heading: number, windDirection: number) => {
  if (
    heading === undefined ||
    windDirection === undefined ||
    heading === null ||
    windDirection === null
  ) {
    return undefined;
  }

  // Calculate wind direction based on heading and wind direction
  let windHeading = windDirection + heading + 180;

  // Normalize negative values
  if (windHeading < 0) {
    windHeading += 360;
  }

  return windHeading;
};
