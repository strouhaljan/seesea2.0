import { Router } from "express";
import Database from "better-sqlite3";
import { resolve } from "node:path";

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

// --- SQLite persistence ---
const dbPath = resolve(process.env.CACHE_DB_PATH ?? resolve(__dirname, "../../cache.db"));
const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS chunks (
    event_id TEXT NOT NULL,
    hour_start INTEGER NOT NULL,
    data TEXT NOT NULL,
    fetched_at INTEGER NOT NULL,
    PRIMARY KEY (event_id, hour_start)
  )
`);

const stmtUpsert = db.prepare(
  "INSERT OR REPLACE INTO chunks (event_id, hour_start, data, fetched_at) VALUES (?, ?, ?, ?)",
);
const stmtDeleteOlderThan = db.prepare("DELETE FROM chunks WHERE fetched_at < ?");

// --- In-memory cache (fast path) ---
const memCache = new Map<string, CacheChunk>();
const CURRENT_CHUNK_TTL_MS = 60_000;

// Load all existing chunks from SQLite into memory on startup
function loadFromDb() {
  const rows = db.prepare("SELECT event_id, hour_start, data, fetched_at FROM chunks").all() as { event_id: string; hour_start: number; data: string; fetched_at: number }[];

  let count = 0;
  for (const row of rows) {
    const eid = row.event_id;
    const key = `${eid}:${row.hour_start}`;
    if (!memCache.has(key)) {
      memCache.set(key, {
        objects: JSON.parse(row.data),
        fetchedAt: row.fetched_at,
      });
      count++;
    }
  }
  if (count > 0) console.log(`Loaded ${count} cached chunks from SQLite`);
}

// Load everything on startup
loadFromDb();

function floorHour(unixSeconds: number): number {
  return Math.floor(unixSeconds / 3600) * 3600;
}

async function fetchChunk(
  eventId: string,
  hourStart: number,
): Promise<CacheChunk | null> {
  const key = `${eventId}:${hourStart}`;
  const existing = memCache.get(key);
  const now = Date.now();
  const isCurrentHour = floorHour(now / 1000) === hourStart;

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
    const objects = data.objects ?? {};

    // Slim the data before storing to save space
    const slimmed: Record<string, SlimPoint[]> = {};
    for (const [vesselId, points] of Object.entries(objects) as [string, DataPoint[]][]) {
      slimmed[vesselId] = points.map(slim);
    }

    const chunk: CacheChunk = {
      objects: slimmed as Record<string, DataPoint[]>,
      fetchedAt: now,
    };
    memCache.set(key, chunk);

    // Persist historical chunks to SQLite (not the current hour — it changes)
    if (!isCurrentHour) {
      stmtUpsert.run(eventId, hourStart, JSON.stringify(slimmed), now);
    }

    return chunk;
  } catch {
    return existing ?? null;
  }
}

async function warmCache(eventId: string, fromTime: number) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const firstHour = floorHour(fromTime);
  const lastHour = floorHour(nowSeconds);

  const allHours: number[] = [];
  for (let h = firstHour; h <= lastHour; h += 3600) {
    const cacheKey = `${eventId}:${h}`;
    if (!memCache.has(cacheKey)) {
      allHours.push(h);
    }
  }

  if (allHours.length === 0) {
    console.log(`Cache already warm for event ${eventId}`);
    return;
  }

  console.log(`Warming cache for event ${eventId}: ${allHours.length} hour-chunks to fetch`);

  const BATCH_SIZE = 4;
  for (let i = 0; i < allHours.length; i += BATCH_SIZE) {
    const batch = allHours.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map((h) => fetchChunk(eventId, h)));
    console.log(`  Cached ${Math.min(i + BATCH_SIZE, allHours.length)}/${allHours.length} chunks`);
  }

  console.log(`Cache warm for event ${eventId}`);
}

const router = Router();

router.get("/:eventId", async (req, res) => {
  const { eventId } = req.params;
  const { time, trail } = req.query;

  if (!time) {
    res.status(400).json({ error: "time query param required" });
    return;
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
        .filter((p) => p.time >= windowStart && p.time <= windowEnd);
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

/** Delete SQLite chunks older than the given age (default 7 days). */
function purgeOldChunks(maxAgeMs = 7 * 24 * 60 * 60 * 1000) {
  const cutoff = Date.now() - maxAgeMs;
  const result = stmtDeleteOlderThan.run(cutoff);
  if (result.changes > 0) {
    console.log(`Purged ${result.changes} stale chunks from SQLite`);
  }
}

/**
 * Look up wind speed readings from the cache for a given time range.
 * Returns a map of vesselId → time-sorted array of {time, tws} pairs.
 */
async function getWindSpeeds(
  eventId: string,
  fromTime: number,
  toTime: number,
): Promise<Record<string, { time: number; tws: number }[]>> {
  const firstHour = floorHour(fromTime);
  const lastHour = floorHour(toTime);
  const hours: number[] = [];
  for (let h = firstHour; h <= lastHour; h += 3600) {
    hours.push(h);
  }

  const chunks = await Promise.all(hours.map((h) => fetchChunk(eventId, h)));

  const result: Record<string, { time: number; tws: number }[]> = {};
  for (const chunk of chunks) {
    if (!chunk) continue;
    for (const [vesselId, points] of Object.entries(chunk.objects)) {
      for (const p of points) {
        if (p.time >= fromTime && p.time <= toTime && p.tws != null) {
          if (!result[vesselId]) result[vesselId] = [];
          result[vesselId].push({ time: p.time, tws: p.tws });
        }
      }
    }
  }

  for (const points of Object.values(result)) {
    points.sort((a, b) => a.time - b.time);
  }

  return result;
}

export { warmCache, purgeOldChunks, getWindSpeeds };
export default router;
