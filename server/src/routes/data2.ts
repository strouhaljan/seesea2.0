import { Router } from "express";

interface DataPoint {
  time: number;
  coords: [number, number];
  hdg?: number;
  cog?: number;
  sog?: number;
  tws?: number;
  twa?: number;
  aws?: number;
  awa?: number;
  stw?: number;
  [key: string]: unknown;
}

interface SlimPoint {
  time: number;
  coords: [number, number];
  hdg?: number;
  cog?: number;
  sog?: number;
  tws?: number;
  twa?: number;
  aws?: number;
  awa?: number;
  stw?: number;
}

function slim(p: DataPoint): SlimPoint {
  return {
    time: p.time,
    coords: p.coords,
    hdg: p.hdg,
    cog: p.cog,
    sog: p.sog,
    tws: p.tws,
    twa: p.twa,
    aws: p.aws,
    awa: p.awa,
    stw: p.stw,
  };
}

interface CacheChunk {
  objects: Record<string, DataPoint[]>;
  fetchedAt: number;
}

// Cache keyed by "eventId:hourStart" — each chunk covers 1 hour
const chunkCache = new Map<string, CacheChunk>();
// Historical chunks never expire; the "current" hour chunk refreshes periodically
const CURRENT_CHUNK_TTL_MS = 60_000;

function floorHour(unixSeconds: number): number {
  return Math.floor(unixSeconds / 3600) * 3600;
}

async function fetchChunk(
  eventId: string,
  hourStart: number,
): Promise<CacheChunk | null> {
  const key = `${eventId}:${hourStart}`;
  const existing = chunkCache.get(key);
  const now = Date.now();
  const isCurrentHour = floorHour(now / 1000) === hourStart;

  // Historical chunks: never re-fetch. Current hour: refresh after TTL.
  if (existing && (!isCurrentHour || now - existing.fetchedAt < CURRENT_CHUNK_TTL_MS)) {
    return existing;
  }

  const start = new Date(hourStart * 1000).toISOString().replace("T", " ").slice(0, 19);
  const end = new Date((hourStart + 3600) * 1000).toISOString().replace("T", " ").slice(0, 19);
  const url = `https://app.seesea.cz/api/cc_event/${eventId}/data2/?gps_datetime_0=${encodeURIComponent(start)}&gps_datetime_1=${encodeURIComponent(end)}&page_size=1000000&detailed=1`;

  try {
    const response = await fetch(url);
    if (!response.ok) return existing ?? null;
    const data = await response.json();
    const chunk: CacheChunk = {
      objects: data.objects ?? {},
      fetchedAt: now,
    };
    chunkCache.set(key, chunk);
    return chunk;
  } catch {
    return existing ?? null;
  }
}

// Track which events we've already started warming
const warmingInProgress = new Set<string>();

/**
 * Warm the cache by fetching all hour-chunks from `fromTime` to now.
 * Fetches in batches of 4 to avoid overwhelming the upstream.
 */
async function warmCache(eventId: string, fromTime: number) {
  const key = `${eventId}:${fromTime}`;
  if (warmingInProgress.has(key)) return;
  warmingInProgress.add(key);

  const nowSeconds = Math.floor(Date.now() / 1000);
  const firstHour = floorHour(fromTime);
  const lastHour = floorHour(nowSeconds);

  const allHours: number[] = [];
  for (let h = firstHour; h <= lastHour; h += 3600) {
    // Skip hours we already have cached
    const cacheKey = `${eventId}:${h}`;
    if (!chunkCache.has(cacheKey)) {
      allHours.push(h);
    }
  }

  console.log(`Warming cache for event ${eventId}: ${allHours.length} hour-chunks to fetch`);

  // Fetch in batches of 4
  const BATCH_SIZE = 4;
  for (let i = 0; i < allHours.length; i += BATCH_SIZE) {
    const batch = allHours.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map((h) => fetchChunk(eventId, h)));
    console.log(`  Cached ${Math.min(i + BATCH_SIZE, allHours.length)}/${allHours.length} chunks`);
  }

  console.log(`Cache warm for event ${eventId}`);
}

const router = Router();

/**
 * GET /api/data2/:eventId?time=...&trail=...&warmFrom=...
 *
 * `time` (unix seconds) — the selected slider position
 * `trail` (minutes) — how many minutes of trail to include before `time`
 * `warmFrom` (unix seconds, optional) — triggers background cache warming from this time
 */
router.get("/:eventId", async (req, res) => {
  const { eventId } = req.params;
  const { time, trail, warmFrom } = req.query;

  if (!time) {
    res.status(400).json({ error: "time query param required" });
    return;
  }

  // Trigger background warming if requested
  if (warmFrom) {
    warmCache(eventId, Number(warmFrom)).catch(() => {});
  }

  const targetTime = Number(time);
  const trailSeconds = Number(trail || 0) * 60;
  const windowStart = targetTime - trailSeconds;
  const windowEnd = targetTime + 30;

  const firstHour = floorHour(windowStart);
  const lastHour = floorHour(windowEnd);
  const hours: number[] = [];
  for (let h = firstHour; h <= lastHour; h += 3600) {
    hours.push(h);
  }

  const chunks = await Promise.all(hours.map((h) => fetchChunk(eventId, h)));

  const merged: Record<string, SlimPoint[]> = {};
  for (const chunk of chunks) {
    if (!chunk) continue;
    for (const [vesselId, points] of Object.entries(chunk.objects)) {
      const filtered = points
        .filter((p) => p.time >= windowStart && p.time <= windowEnd)
        .map(slim);
      if (filtered.length === 0) continue;
      if (!merged[vesselId]) merged[vesselId] = [];
      merged[vesselId].push(...filtered);
    }
  }

  for (const points of Object.values(merged)) {
    points.sort((a, b) => a.time - b.time);
  }

  res.json({ objects: merged });
});

export default router;
