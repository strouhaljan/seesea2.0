import { Router } from "express";
import { getWindSpeeds } from "./data2";

const router = Router();

/** Find the nearest wind speed reading for a given timestamp via binary search. */
function findNearestTws(
  readings: { time: number; tws: number }[],
  timestamp: number,
): number | undefined {
  if (readings.length === 0) return undefined;

  let lo = 0;
  let hi = readings.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (readings[mid].time < timestamp) lo = mid + 1;
    else hi = mid;
  }

  // Check lo and lo-1 to find the closest
  let best = lo;
  if (lo > 0 && Math.abs(readings[lo - 1].time - timestamp) < Math.abs(readings[lo].time - timestamp)) {
    best = lo - 1;
  }

  // Only return if within 5 minutes of the tail point
  if (Math.abs(readings[best].time - timestamp) > 300) return undefined;

  return readings[best].tws;
}

router.get("/:eventId/:legId", async (req, res) => {
  const { eventId, legId } = req.params;
  const url = `https://app.seesea.cz/api/cc_event/${eventId}/data/live/${legId}/tails`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      res.status(response.status).json({ error: "Upstream error" });
      return;
    }

    const data = await response.json();
    const tails: Record<string, number[][]> = data.tails ?? {};

    // Find the time range across all tail points
    let minTime = Infinity;
    let maxTime = -Infinity;
    for (const points of Object.values(tails)) {
      for (const p of points) {
        if (p[0] < minTime) minTime = p[0];
        if (p[0] > maxTime) maxTime = p[0];
      }
    }

    if (minTime <= maxTime) {
      const windData = await getWindSpeeds(eventId, minTime, maxTime);

      for (const [vesselId, points] of Object.entries(tails)) {
        const readings = windData[vesselId];
        if (!readings || readings.length === 0) continue;
        for (const p of points) {
          const tws = findNearestTws(readings, p[0]);
          if (tws !== undefined) {
            p[3] = tws;
          }
        }
      }
    }

    res.json(data);
  } catch {
    res.status(502).json({ error: "Failed to fetch upstream tails data" });
  }
});

export default router;
