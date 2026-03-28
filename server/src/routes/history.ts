import { Router } from "express";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ALLOWED_FIELDS = [
  "coords",
  "hdg",
  "cog",
  "sog",
  "twa",
  "tws",
  "time",
] as const;

const dataPath = resolve(
  process.env.HISTORY_DATA_PATH ?? resolve(__dirname, "../../../public/data.json"),
);

interface DataPoint {
  time: number;
  [key: string]: unknown;
}

interface HistoryData {
  sample: number;
  to: number;
  objects: Record<string, DataPoint[]>;
}

let historyData: HistoryData | null = null;

function loadData(): HistoryData {
  if (!historyData) {
    console.log(`Loading history data from ${dataPath}...`);
    historyData = JSON.parse(readFileSync(dataPath, "utf-8"));
    console.log("History data loaded.");
  }
  return historyData!;
}

// Load on startup
try {
  loadData();
} catch (e) {
  console.warn("Could not load history data on startup:", (e as Error).message);
}

const router = Router();

router.get("/:eventId", (req, res) => {
  const data = historyData;
  if (!data) {
    res.status(503).json({ error: "History data not loaded" });
    return;
  }

  const fromParam = req.query.from as string | undefined;
  const toParam = req.query.to as string | undefined;

  if (!fromParam || !toParam) {
    // Return metadata only
    const vesselMeta: Record<string, number> = {};
    for (const [id, points] of Object.entries(data.objects)) {
      vesselMeta[id] = points.length;
    }

    let minTime = Infinity;
    let maxTime = -Infinity;
    for (const points of Object.values(data.objects)) {
      for (const p of points) {
        if (p.time < minTime) minTime = p.time;
        if (p.time > maxTime) maxTime = p.time;
      }
    }

    res.json({
      sample: data.sample,
      timeRange: { from: minTime, to: maxTime },
      vessels: vesselMeta,
    });
    return;
  }

  const from = parseInt(fromParam, 10);
  const to = parseInt(toParam, 10);

  if (isNaN(from) || isNaN(to)) {
    res.status(400).json({ error: "from and to must be valid Unix timestamps" });
    return;
  }

  const result: Record<string, Record<string, unknown>[]> = {};

  for (const [id, points] of Object.entries(data.objects)) {
    const filtered = points
      .filter((p) => p.time >= from && p.time <= to)
      .map((p) => {
        const slim: Record<string, unknown> = {};
        for (const field of ALLOWED_FIELDS) {
          if (field in p) slim[field] = p[field];
        }
        return slim;
      });
    result[id] = filtered;
  }

  res.json({ objects: result });
});

export default router;
