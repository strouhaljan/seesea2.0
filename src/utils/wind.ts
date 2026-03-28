export const WIND_SPEED_COLORS = [
  { threshold: 0, color: "#4a6a7a" },
  { threshold: 5, color: "#00bfff" },
  { threshold: 10, color: "#0080ff" },
  { threshold: 15, color: "#00ff80" },
  { threshold: 20, color: "#00c000" },
  { threshold: 25, color: "#ffd700" },
  { threshold: 30, color: "#ff8c00" },
  { threshold: 35, color: "#ff4500" },
  { threshold: Infinity, color: "#ff0000" },
];

export const getColorBySpeed = (windSpeed?: number): string => {
  if (!windSpeed || windSpeed <= 0) return WIND_SPEED_COLORS[0].color;

  for (let i = WIND_SPEED_COLORS.length - 1; i >= 0; i--) {
    if (windSpeed >= WIND_SPEED_COLORS[i].threshold) {
      return WIND_SPEED_COLORS[i].color;
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
