export const getColorBySpeed = (windSpeed?: number): string => {
  if (!windSpeed || windSpeed <= 0) return "#000000"; // Black for no wind

  if (windSpeed < 5) return "#00bfff"; // Light blue for light wind
  if (windSpeed < 10) return "#0080ff"; // Medium blue for moderate wind
  if (windSpeed < 15) return "#00ff80"; // Light green
  if (windSpeed < 20) return "#00c000"; // Medium green
  if (windSpeed < 25) return "#ffd700"; // Yellow
  if (windSpeed < 30) return "#ff8c00"; // Orange
  if (windSpeed < 35) return "#ff4500"; // Orange-red

  return "#ff0000"; // Red for strong wind
};

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
