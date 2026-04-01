/**
 * Haversine distance between two [lon, lat] points, in nautical miles.
 */
export function distanceNm(
  a: [number, number],
  b: [number, number],
): number {
  const toRad = Math.PI / 180;
  const R = 3440.065; // Earth radius in nautical miles
  const dLat = (b[1] - a[1]) * toRad;
  const dLon = (b[0] - a[0]) * toRad;
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h =
    sinLat * sinLat +
    Math.cos(a[1] * toRad) * Math.cos(b[1] * toRad) * sinLon * sinLon;
  return 2 * R * Math.asin(Math.sqrt(h));
}
