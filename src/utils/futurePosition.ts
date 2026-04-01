/** Calculate a future position given current coords, speed (knots), and course (degrees from north). */
export function futurePosition(
  coords: [number, number],
  sogKnots: number,
  cogDeg: number,
  minutes: number,
): [number, number] {
  const distanceNm = sogKnots * (minutes / 60);
  const cogRad = (cogDeg * Math.PI) / 180;
  const latRad = (coords[1] * Math.PI) / 180;
  const newLat = coords[1] + (distanceNm * Math.cos(cogRad)) / 60;
  const newLng = coords[0] + (distanceNm * Math.sin(cogRad)) / (60 * Math.cos(latRad));
  return [newLng, newLat];
}
