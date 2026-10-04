# Dev Data & Simulated Live Replay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let SeeSea 2.0 run offline against a recorded event (vr-2026 Leg 2) as if the race were live, driven by a virtual clock.

**Architecture:** All upstream calls in the Express server move behind an `Upstream` interface with two implementations: `HttpUpstream` (today's fetches, configurable base URLs) and `ReplayUpstream` (gzipped fixtures, never returning data later than the virtual clock). A server `clock` module replaces race-time `Date.now()` calls; the client reads it once from `/api/clock` and uses it for its own race-time call sites.

**Tech Stack:** Node 20 + Express 4 + better-sqlite3 (server, run with `tsx`), React 19 + Vite 6 + Mapbox GL (client), TypeScript 5, `node:zlib` for gzip.

**Spec:** `docs/superpowers/specs/2026-10-03-dev-data-replay-design.md`

## Global Constraints

- No test framework is added (agreed: tests come later). Verification = type-check, lint, and scripted `curl` / screenshot checks given in each task.
- Baseline is not clean: client `npx tsc -b` already reports 5 errors (`LiveMap.tsx` `onToggleControls`, unused `mapboxgl` in `useDistanceMeasure.ts`/`useLegLayer.ts`/`useTailLayer.ts`, `process` in `vite.config.ts`) and `npm run lint` reports 4 errors (`LiveMap.tsx:54`, `useFutureProjections.tsx:38,122`, `useWindOverlay.ts:59`). "Passes" below means **no errors beyond these**. Server `tsc --noEmit` is clean and must stay clean.
- Env var names, verbatim: `REPLAY`, `REPLAY_START`, `REPLAY_SPEED`, `SEESEA_API_URL` (default `https://app.seesea.cz/api`), `OPEN_METEO_URL` (default `https://api.open-meteo.com/v1`), `FIXTURES_DIR` (default `server/fixtures`).
- Fixtures live in `server/fixtures/<slug>/`; only `server/fixtures/vr-2026/` is committed; it contains Leg 2 only (leg id `20151425`, event id `201619`).
- Rule: `clock.now()` for race time; `Date.now()` for cache ages (TTL / `fetchedAt`) and UI "x seconds ago" text.
- Existing patterns: server imports use `.js` suffixes (`NodeNext`), server package is CommonJS (no `"type": "module"`) so no top-level `await` in scripts; client uses plain function modules and hooks.
- Commit style: sentence-case imperative subject (e.g. `Add upstream adapter`), body optional, trailer `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- The shell is fish: use `env VAR=value cmd` rather than `VAR=value cmd`, and run background servers with a trailing `&` in a single command, stopping them with `lsof -ti tcp:<port> | xargs kill`.

## Review Focus

1. **`REPLAY` set to an unrecorded slug or junk `REPLAY_SPEED`/`REPLAY_START`** — server must refuse to start with a message that says how to record, not crash later with `ENOENT`/`NaN`. Pinned in Task 3, Step 6.
2. **Virtual clock reaching the end of the recorded leg** — clock stops at leg end, live keeps showing final positions, no 5xx. Pinned in Task 4, Step 6.
3. **`REPLAY_START` before the leg starts** — live returns `{}` objects and tails `{}` with HTTP 200, not an error. Pinned in Task 4, Step 6.
4. **Crossing an hour boundary at high speed** — wind window and current-hour chunk advance instead of staying stuck on the first hour. Pinned in Task 4, Step 6.
5. **Live mode (no `REPLAY`) unchanged** — production must keep working against real upstream, and finished hours must still be served from cache (no refetch storm from the new completeness rule). Pinned in Task 3, Step 7 and Task 6, Step 6.

---

## File Structure

Server (new):
- `server/src/time.ts` — `floorHour`, `toUpstreamTime`, `sleep` (shared helpers)
- `server/src/upstream/types.ts` — `Upstream` interface, raw response types, `UpstreamError`
- `server/src/upstream/regions.ts` — wind models + grid regions (moved from `wind.ts`)
- `server/src/upstream/http.ts` — `HttpUpstream`, `getWindHistory`
- `server/src/upstream/fixtures.ts` — fixture paths, gzip/JSON read-write, `loadFixture`
- `server/src/upstream/replay.ts` — `ReplayUpstream`
- `server/src/upstream/index.ts` — `upstream` singleton + type re-exports
- `server/src/clock.ts` — virtual clock
- `server/src/routes/clock.ts` — `GET /api/clock`
- `server/src/routes/upstreamError.ts` — maps upstream errors to responses
- `server/src/scripts/record.ts` — recorder CLI
- `server/fixtures/vr-2026/**` — committed fixture

Server (modified): `server/src/index.ts`, `server/src/routes/{event,live,leg,tails,wind,data2}.ts`, `server/package.json`

Client (new): `src/utils/clock.ts`, `src/components/ReplayBadge.tsx`

Client (modified): `src/main.tsx`, `src/hooks/useEventConfig.ts`, `src/pages/LivePage.tsx`, `src/hooks/useTailLayer.ts`, `src/utils/windGrid.ts`, `src/hooks/useHistoryData.ts`, `src/App.css`

Repo: `.gitignore`, `.dockerignore`, `.env.example`, `README.md`

---

### Task 1: Upstream adapter (HttpUpstream) and configurable base URLs

Pure refactor: every upstream `fetch` moves into `HttpUpstream`; behaviour against real upstream is unchanged.

**Files:**
- Create: `server/src/time.ts`, `server/src/upstream/types.ts`, `server/src/upstream/regions.ts`, `server/src/upstream/http.ts`, `server/src/upstream/index.ts`, `server/src/routes/upstreamError.ts`
- Modify: `server/src/routes/event.ts`, `live.ts`, `leg.ts`, `tails.ts`, `wind.ts`, `data2.ts`, `server/src/index.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `floorHour(unixSeconds: number): number`, `toUpstreamTime(unixSeconds: number): string`, `sleep(ms: number): Promise<void>` from `server/src/time.ts`
  - Types `SlimPoint`, `DataHour`, `RawEventLeg`, `RawEvent`, `RawLive`, `RawTails`, `WindModel`, `WindRegion`, `WindPoint`, `Upstream`, class `UpstreamError(status, message)` from `server/src/upstream/types.ts`
  - `MODEL_PARAMS`, `WIND_MODELS`, `REGIONS`, `gridQuery(region)` from `server/src/upstream/regions.ts`
  - `class HttpUpstream implements Upstream`, `getWindHistory(model, region, startDate, endDate): Promise<WindPoint[]>` from `server/src/upstream/http.ts`
  - `upstream: Upstream` singleton from `server/src/upstream/index.ts`
  - `sendUpstreamError(res, err, message)` from `server/src/routes/upstreamError.ts`

- [ ] **Step 1: Create `server/src/time.ts`**

```ts
export function floorHour(unixSeconds: number): number {
  return Math.floor(unixSeconds / 3600) * 3600;
}

/** Format unix seconds as the "YYYY-MM-DD HH:MM:SS" UTC string upstream's data2 filter expects. */
export function toUpstreamTime(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString().replace("T", " ").slice(0, 19);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
```

- [ ] **Step 2: Create `server/src/upstream/types.ts`**

```ts
export interface SlimPoint {
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

/** One hour of history: vesselId → points. */
export type DataHour = Record<string, SlimPoint[]>;

export interface RawEventLeg {
  id: number;
  name: string;
  active: number;
  start: string;
  end: string;
  race_type: string;
}

export interface RawEvent {
  cc_event_id: number;
  slug: string;
  cc_object?: unknown[];
  cc_event_leg?: RawEventLeg[];
  [key: string]: unknown;
}

export interface RawLive {
  updateInterval?: number;
  objects?: Record<string, unknown>;
}

export interface RawTails {
  beginDate?: string;
  trackLengthMax?: number;
  tails: Record<string, number[][]> | null;
}

export type WindModel = "icon_2i" | "ecmwf";

export interface WindRegion {
  name: string;
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  latSteps: number;
  lngSteps: number;
}

/** One grid point of an Open-Meteo multi-location response. */
export interface WindPoint {
  hourly?: {
    time: string[];
    wind_speed_10m: (number | null)[];
    wind_direction_10m: (number | null)[];
  };
  [key: string]: unknown;
}

/** Upstream answered with a non-2xx status (or replay has no such data). */
export class UpstreamError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "UpstreamError";
  }
}

export interface Upstream {
  getEvent(slug: string): Promise<RawEvent>;
  getLive(eventId: string): Promise<RawLive>;
  getTails(eventId: string, legId: string): Promise<RawTails>;
  getLeg(eventId: string, legId: string): Promise<unknown>;
  /** History for [hourStart, hourStart + 3600), slimmed to SlimPoint fields. */
  getDataHour(eventId: string, hourStart: number): Promise<DataHour>;
  /** Wind for one region: 4 hourly values starting at the current hour. */
  getWind(model: WindModel, region: WindRegion): Promise<WindPoint[]>;
}
```

- [ ] **Step 3: Create `server/src/upstream/regions.ts`** (moved verbatim from `wind.ts`, plus `name`-typed regions and the grid query builder)

```ts
import type { WindModel, WindRegion } from "./types.js";

export const MODEL_PARAMS: Record<WindModel, string> = {
  icon_2i: "italia_meteo_arpae_icon_2i",
  ecmwf: "ecmwf_ifs025",
};

export const WIND_MODELS = Object.keys(MODEL_PARAMS) as WindModel[];

// Three coastal rectangles following the Dubrovnik–Murter race corridor
export const REGIONS: WindRegion[] = [
  {
    name: "south",    // Dubrovnik to Korčula
    minLat: 42.4, maxLat: 43.1,
    minLng: 16.4, maxLng: 18.2,
    latSteps: 8, lngSteps: 12,
  },
  {
    name: "middle",   // Korčula to Split
    minLat: 43.0, maxLat: 43.6,
    minLng: 15.6, maxLng: 17.2,
    latSteps: 8, lngSteps: 12,
  },
  {
    name: "north",    // Split to Murter/Zadar
    minLat: 43.4, maxLat: 44.1,
    minLng: 15.0, maxLng: 16.5,
    latSteps: 8, lngSteps: 12,
  },
];

/** Row-major grid point coordinates as an Open-Meteo `latitude=…&longitude=…` query. */
export function gridQuery(region: WindRegion): string {
  const dlat = (region.maxLat - region.minLat) / (region.latSteps - 1);
  const dlng = (region.maxLng - region.minLng) / (region.lngSteps - 1);

  const lats: string[] = [];
  const lngs: string[] = [];
  for (let row = 0; row < region.latSteps; row++) {
    for (let col = 0; col < region.lngSteps; col++) {
      lats.push((region.minLat + row * dlat).toFixed(2));
      lngs.push((region.minLng + col * dlng).toFixed(2));
    }
  }

  return `latitude=${lats.join(",")}&longitude=${lngs.join(",")}`;
}
```

- [ ] **Step 4: Create `server/src/upstream/http.ts`**

```ts
import { toUpstreamTime } from "../time.js";
import { MODEL_PARAMS, gridQuery } from "./regions.js";
import {
  UpstreamError,
  type DataHour,
  type RawEvent,
  type RawLive,
  type RawTails,
  type SlimPoint,
  type Upstream,
  type WindModel,
  type WindPoint,
  type WindRegion,
} from "./types.js";

const SEESEA_API_URL = process.env.SEESEA_API_URL ?? "https://app.seesea.cz/api";
const OPEN_METEO_URL = process.env.OPEN_METEO_URL ?? "https://api.open-meteo.com/v1";
const OPEN_METEO_HISTORICAL_URL = "https://historical-forecast-api.open-meteo.com/v1";
const WIND_VARS = "hourly=wind_speed_10m,wind_direction_10m";

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new UpstreamError(response.status, `Upstream ${response.status} for ${url}`);
  }
  return (await response.json()) as T;
}

function slim(p: SlimPoint): SlimPoint {
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

function toPoints(data: WindPoint | WindPoint[]): WindPoint[] {
  return Array.isArray(data) ? data : [data];
}

export class HttpUpstream implements Upstream {
  getEvent(slug: string): Promise<RawEvent> {
    return getJson(`${SEESEA_API_URL}/cc_event/${slug}/`);
  }

  getLive(eventId: string): Promise<RawLive> {
    return getJson(`${SEESEA_API_URL}/cc_event/${eventId}/data/live`);
  }

  getTails(eventId: string, legId: string): Promise<RawTails> {
    return getJson(`${SEESEA_API_URL}/cc_event/${eventId}/data/live/${legId}/tails`);
  }

  getLeg(eventId: string, legId: string): Promise<unknown> {
    return getJson(`${SEESEA_API_URL}/cc_event/${eventId}/leg/${legId}/`);
  }

  async getDataHour(eventId: string, hourStart: number): Promise<DataHour> {
    const start = toUpstreamTime(hourStart);
    const end = toUpstreamTime(hourStart + 3600);
    const url = `${SEESEA_API_URL}/cc_event/${eventId}/data2/?gps_datetime_0=${encodeURIComponent(start)}&gps_datetime_1=${encodeURIComponent(end)}&page_size=1000000&detailed=1`;
    const data = await getJson<{ objects?: Record<string, SlimPoint[]> }>(url);

    // Slim the data before storing to save space
    const slimmed: DataHour = {};
    for (const [vesselId, points] of Object.entries(data.objects ?? {})) {
      slimmed[vesselId] = points.map(slim);
    }
    return slimmed;
  }

  async getWind(model: WindModel, region: WindRegion): Promise<WindPoint[]> {
    const url =
      `${OPEN_METEO_URL}/forecast?${gridQuery(region)}&${WIND_VARS}` +
      `&models=${MODEL_PARAMS[model]}&forecast_hours=4`;
    return toPoints(await getJson(url));
  }
}

/** Hourly wind for whole past UTC days (inclusive, YYYY-MM-DD). Used by the recorder. */
export async function getWindHistory(
  model: WindModel,
  region: WindRegion,
  startDate: string,
  endDate: string,
): Promise<WindPoint[]> {
  const url =
    `${OPEN_METEO_HISTORICAL_URL}/forecast?${gridQuery(region)}&${WIND_VARS}` +
    `&models=${MODEL_PARAMS[model]}&start_date=${startDate}&end_date=${endDate}`;
  return toPoints(await getJson(url));
}
```

- [ ] **Step 5: Create `server/src/upstream/index.ts`**

```ts
import { HttpUpstream } from "./http.js";
import type { Upstream } from "./types.js";

export const upstream: Upstream = new HttpUpstream();

export * from "./types.js";
```

- [ ] **Step 6: Create `server/src/routes/upstreamError.ts`**

```ts
import type { Response } from "express";
import { UpstreamError } from "../upstream/index.js";

/** Upstream non-2xx → same status + "Upstream error"; anything else (network, parse) → 502. */
export function sendUpstreamError(res: Response, err: unknown, message: string) {
  if (err instanceof UpstreamError) {
    res.status(err.status).json({ error: "Upstream error" });
  } else {
    res.status(502).json({ error: message });
  }
}
```

- [ ] **Step 7: Rewrite `server/src/routes/event.ts`**

```ts
import { Router } from "express";
import { upstream, type RawEventLeg } from "../upstream/index.js";
import { sendUpstreamError } from "./upstreamError.js";

const router = Router();

interface EventConfig {
  eventId: number;
  crews: unknown[];
  legs: RawEventLeg[];
  fetchedAt: number;
}

const cache = new Map<string, EventConfig>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

router.get("/:slug", async (req, res) => {
  const { slug } = req.params;

  const cached = cache.get(slug);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    res.json({ eventId: cached.eventId, crews: cached.crews, legs: cached.legs });
    return;
  }

  try {
    const data = await upstream.getEvent(slug);
    const config: EventConfig = {
      eventId: data.cc_event_id,
      crews: data.cc_object ?? [],
      legs: data.cc_event_leg ?? [],
      fetchedAt: Date.now(),
    };

    cache.set(slug, config);
    res.json({ eventId: config.eventId, crews: config.crews, legs: config.legs });
  } catch (err) {
    sendUpstreamError(res, err, "Failed to fetch event config");
  }
});

export default router;
```

- [ ] **Step 8: Rewrite `server/src/routes/live.ts`**

```ts
import { Router } from "express";
import { upstream } from "../upstream/index.js";
import { sendUpstreamError } from "./upstreamError.js";

const ALLOWED_FIELDS = ["coords", "hdg", "cog", "sog", "twa", "tws"] as const;

const router = Router();

router.get("/:eventId", async (req, res) => {
  const { eventId } = req.params;

  try {
    const data = await upstream.getLive(eventId);
    const stripped: Record<string, Record<string, unknown>> = {};

    for (const [id, vessel] of Object.entries(data.objects ?? {})) {
      const v = vessel as Record<string, unknown>;
      const slim: Record<string, unknown> = {};
      for (const field of ALLOWED_FIELDS) {
        if (field in v) slim[field] = v[field];
      }
      stripped[id] = slim;
    }

    res.json({ objects: stripped });
  } catch (err) {
    sendUpstreamError(res, err, "Failed to fetch upstream data");
  }
});

export default router;
```

- [ ] **Step 9: Rewrite `server/src/routes/leg.ts`**

```ts
import { Router } from "express";
import { upstream } from "../upstream/index.js";
import { sendUpstreamError } from "./upstreamError.js";

const router = Router();

router.get("/:eventId/:legId", async (req, res) => {
  const { eventId, legId } = req.params;

  try {
    res.json(await upstream.getLeg(eventId, legId));
  } catch (err) {
    sendUpstreamError(res, err, "Failed to fetch upstream leg data");
  }
});

export default router;
```

- [ ] **Step 10: Edit `server/src/routes/tails.ts`**

Replace the imports at the top:

```ts
import { Router } from "express";
import { getWindSpeeds } from "./data2";
import { upstream } from "../upstream/index.js";
import { sendUpstreamError } from "./upstreamError.js";
```

Replace the route handler's fetch block — from `const url = \`https://app.seesea.cz/...tails\`;` through `const tails: Record<string, number[][]> = data.tails ?? {};` — with:

```ts
  try {
    const data = await upstream.getTails(eventId, legId);
    const tails: Record<string, number[][]> = data.tails ?? {};
```

and replace the final `catch` block:

```ts
  } catch (err) {
    sendUpstreamError(res, err, "Failed to fetch upstream tails data");
  }
```

The wind-enrichment loop and `res.json(data)` in between stay as they are.

- [ ] **Step 11: Rewrite `server/src/routes/wind.ts`**

```ts
import { Router } from "express";
import { upstream, type WindModel } from "../upstream/index.js";
import { MODEL_PARAMS, REGIONS, WIND_MODELS } from "../upstream/regions.js";
import { sleep } from "../time.js";

const router = Router();

const CACHE_TTL_MS = 60 * 60 * 1000;

interface CacheEntry {
  data: unknown;
  fetchedAt: number;
}

const cache = new Map<WindModel, CacheEntry>();
const inflight = new Map<WindModel, Promise<unknown>>();

async function fetchAllRegions(model: WindModel): Promise<unknown> {
  const regions = [];

  for (let i = 0; i < REGIONS.length; i++) {
    if (i > 0) await sleep(300);
    const region = REGIONS[i];
    const points = await upstream.getWind(model, region);

    regions.push({
      bounds: {
        minLat: region.minLat,
        maxLat: region.maxLat,
        minLng: region.minLng,
        maxLng: region.maxLng,
      },
      latSteps: region.latSteps,
      lngSteps: region.lngSteps,
      points,
    });
  }

  return regions;
}

async function getGridData(model: WindModel): Promise<unknown> {
  const cached = cache.get(model);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.data;
  }

  const existing = inflight.get(model);
  if (existing) return existing;

  const promise = fetchAllRegions(model)
    .then((data) => {
      cache.set(model, { data, fetchedAt: Date.now() });
      inflight.delete(model);
      return data;
    })
    .catch((err) => {
      inflight.delete(model);
      if (cached) {
        console.warn(`Open-Meteo fetch failed for ${model}, serving stale cache:`, err);
        return cached.data;
      }
      throw err;
    });

  inflight.set(model, promise);
  return promise;
}

export async function warmWindCache(): Promise<void> {
  for (const model of WIND_MODELS) {
    try {
      await getGridData(model);
      console.log(`Wind cache warmed for ${model}`);
    } catch (err) {
      console.warn(`Wind cache warming failed for ${model}:`, err);
    }
  }
}

router.get("/:model", async (req, res) => {
  const model = req.params.model as WindModel;

  if (!MODEL_PARAMS[model]) {
    res.status(400).json({ error: `Unknown model: ${model}` });
    return;
  }

  try {
    const data = await getGridData(model);
    res.json(data);
  } catch {
    res.status(502).json({ error: "Failed to fetch wind data" });
  }
});

export default router;
```

- [ ] **Step 12: Edit `server/src/routes/data2.ts`**

a) Replace everything from the top of the file through the end of `interface CacheChunk { … }` (the `DataPoint`/`SlimPoint` interfaces, `slim()`, and `CacheChunk`) with:

```ts
import { Router } from "express";
import Database from "better-sqlite3";
import { resolve } from "node:path";
import { upstream, type DataHour, type SlimPoint } from "../upstream/index.js";
import { floorHour } from "../time.js";

interface CacheChunk {
  objects: DataHour;
  fetchedAt: number;
}
```

b) Delete the local `function floorHour(...)` (now imported).

c) Replace the body of `fetchChunk` with:

```ts
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

  try {
    const objects = await upstream.getDataHour(eventId, hourStart);
    const chunk: CacheChunk = { objects, fetchedAt: now };
    memCache.set(key, chunk);

    // Persist historical chunks to SQLite (not the current hour — it changes)
    if (!isCurrentHour) {
      stmtUpsert.run(eventId, hourStart, JSON.stringify(objects), now);
    }

    return chunk;
  } catch {
    return existing ?? null;
  }
}
```

d) In the `/:eventId` route the local `merged` map keeps type `Record<string, SlimPoint[]>` (now the imported `SlimPoint`). No other changes.

- [ ] **Step 13: Edit `server/src/index.ts` — `tryWarmCache` uses the adapter**

Add the import:

```ts
import { upstream } from "./upstream/index.js";
```

Replace the block from `const res = await fetch(\`https://app.seesea.cz/api/cc_event/${slug}/\`);` through `const legs = (data.cc_event_leg ?? []) as { active: number; start: string; end: string }[];` with:

```ts
    const data = await upstream.getEvent(slug);
    const eventId = String(data.cc_event_id);
    const legs = data.cc_event_leg ?? [];
```

(Upstream failures now throw and land in the existing `catch` → `Cache warming failed:` log.)

- [ ] **Step 14: Confirm no hardcoded upstream URLs remain and the server type-checks**

Run: `grep -rn "app.seesea.cz\|api.open-meteo.com" server/src`
Expected: only the two defaults in `server/src/upstream/http.ts`.

Run: `server/node_modules/.bin/tsc -p server/tsconfig.json --noEmit`
Expected: exit 0, no output.

- [ ] **Step 15: Smoke-test against real upstream**

Run (one command):
```bash
env PORT=3101 CACHE_DB_PATH=.context/t1.db server/node_modules/.bin/tsx server/src/index.ts > .context/t1.log 2>&1 &
```
Then (after ~3 s):
```bash
curl -s localhost:3101/api/event/vr-2026 | python3 -c "import json,sys;d=json.load(sys.stdin);print(d['eventId'],[l['id'] for l in d['legs']],len(d['crews']))"
curl -s "localhost:3101/api/data2/201619/chunk?hour=1775124000" | python3 -c "import json,sys;o=json.load(sys.stdin)['objects'];print(len(o),sorted(next(iter(o.values()))[0].keys()))"
curl -s localhost:3101/api/leg/201619/20151425 | head -c 120; echo
curl -s localhost:3101/api/live/201619; echo
curl -s -o /dev/null -w '%{http_code}\n' localhost:3101/api/tails/201619/20151425
curl -s localhost:3101/api/wind/ecmwf | python3 -c "import json,sys;d=json.load(sys.stdin);print(len(d),[len(r['points']) for r in d],len(d[0]['points'][0]['hourly']['time']))"
lsof -ti tcp:3101 | xargs kill
```
Expected:
- `201619 [20151424, 20151425] 43`
- `42 ['aws', 'awa', 'cog', 'coords', 'hdg', 'sog', 'stw', 'time', 'tws', 'twa']` (some keys may be absent if upstream omits them; `coords` and `time` must be present)
- leg JSON prefix (any JSON object)
- `{"objects":{}}`
- `200`
- `3 [96, 96, 96] 4`

- [ ] **Step 16: Lint and commit**

Run: `npx eslint server/src`
Expected: no errors.

```bash
git add server/src
git commit -m "Move upstream requests behind an adapter

All SeeSea and Open-Meteo requests go through HttpUpstream; base URLs
are configurable via SEESEA_API_URL and OPEN_METEO_URL.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Recorder and committed vr-2026 fixture

**Files:**
- Create: `server/src/upstream/fixtures.ts`, `server/src/scripts/record.ts`, `server/fixtures/vr-2026/**` (generated)
- Modify: `server/package.json`, `.gitignore`, `.dockerignore`

**Interfaces:**
- Consumes: `HttpUpstream`, `getWindHistory` (Task 1), `REGIONS`, `WIND_MODELS` (Task 1), `floorHour`, `sleep` (Task 1), types `WindModel`, `WindPoint`.
- Produces (from `server/src/upstream/fixtures.ts`):
  - `FIXTURES_DIR: string`
  - `interface Manifest { slug: string; eventId: number; legIds: number[]; recordedAt: string }`
  - `fixturePaths(slug)` → `{ dir, manifest, event, leg(legId), dataHour(hourStart), wind(model) }` (absolute paths)
  - `writeJson(path, data)`, `writeGzJson(path, data)`, `readJson<T>(path): T`, `readGzJson<T>(path): T`
  - Fixture files (format the replay depends on):
    - `manifest.json` — `Manifest`
    - `event.json` — raw `RawEvent`
    - `legs/<legId>.json` — raw leg response
    - `data2/<hourStart>.json.gz` — `DataHour`
    - `wind/<model>.json.gz` — `Record<regionName, WindPoint[]>`, each point's `hourly.time` in `"YYYY-MM-DDTHH:MM"` UTC

- [ ] **Step 1: Create `server/src/upstream/fixtures.ts`**

```ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import type { WindModel } from "./types.js";

export const FIXTURES_DIR = resolve(process.env.FIXTURES_DIR ?? resolve(__dirname, "../../fixtures"));

export interface Manifest {
  slug: string;
  eventId: number;
  legIds: number[];
  recordedAt: string;
}

export function fixturePaths(slug: string) {
  const dir = resolve(FIXTURES_DIR, slug);
  return {
    dir,
    manifest: resolve(dir, "manifest.json"),
    event: resolve(dir, "event.json"),
    leg: (legId: number | string) => resolve(dir, "legs", `${legId}.json`),
    dataHour: (hourStart: number) => resolve(dir, "data2", `${hourStart}.json.gz`),
    wind: (model: WindModel) => resolve(dir, "wind", `${model}.json.gz`),
  };
}

export function writeJson(path: string, data: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
}

export function writeGzJson(path: string, data: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, gzipSync(JSON.stringify(data), { level: 9 }));
}

export function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

export function readGzJson<T>(path: string): T {
  return JSON.parse(gunzipSync(readFileSync(path)).toString("utf8")) as T;
}

export { existsSync };
```

- [ ] **Step 2: Create `server/src/scripts/record.ts`**

```ts
/**
 * Records an event from upstream into server/fixtures/<slug>/ for offline replay.
 *
 *   npm --prefix server run record -- <slug> [--legs <id,id>]
 *
 * Defaults to all active legs. Re-running skips history hours already on disk
 * and merges leg ids into the existing manifest.
 */
import { HttpUpstream, getWindHistory } from "../upstream/http.js";
import { REGIONS, WIND_MODELS } from "../upstream/regions.js";
import {
  existsSync,
  fixturePaths,
  readJson,
  writeGzJson,
  writeJson,
  type Manifest,
} from "../upstream/fixtures.js";
import type { WindPoint } from "../upstream/types.js";
import { floorHour, sleep } from "../time.js";

const BATCH_SIZE = 4;
const WIND_LOOKAHEAD_S = 4 * 3600;

const toSeconds = (iso: string) => Math.floor(Date.parse(iso) / 1000);
const utcDate = (unixSeconds: number) => new Date(unixSeconds * 1000).toISOString().slice(0, 10);

function parseArgs(argv: string[]) {
  const slug = argv[0];
  const legsIdx = argv.indexOf("--legs");
  const legIds = legsIdx >= 0 ? (argv[legsIdx + 1] ?? "").split(",").map(Number) : undefined;
  if (!slug || slug.startsWith("--") || legIds?.some((id) => !Number.isInteger(id))) {
    console.error("Usage: npm --prefix server run record -- <slug> [--legs <id,id>]");
    process.exit(1);
  }
  return { slug, legIds };
}

async function main() {
  const { slug, legIds } = parseArgs(process.argv.slice(2));
  const http = new HttpUpstream();
  const paths = fixturePaths(slug);
  const missing: string[] = [];

  console.log(`Recording ${slug} into ${paths.dir}`);
  const event = await http.getEvent(slug);
  const eventId = String(event.cc_event_id);
  const allLegs = event.cc_event_leg ?? [];
  const legs = legIds
    ? allLegs.filter((l) => legIds.includes(l.id))
    : allLegs.filter((l) => l.active === 1);
  if (legs.length === 0) {
    console.error(`No matching legs. Available: ${allLegs.map((l) => `${l.id} (${l.name})`).join(", ")}`);
    process.exit(1);
  }

  const previous = existsSync(paths.manifest) ? readJson<Manifest>(paths.manifest) : null;
  const recordedLegIds = [...new Set([...(previous?.legIds ?? []), ...legs.map((l) => l.id)])].sort((a, b) => a - b);
  const recordedLegs = allLegs.filter((l) => recordedLegIds.includes(l.id));

  writeJson(paths.event, event);
  for (const leg of legs) {
    writeJson(paths.leg(leg.id), await http.getLeg(eventId, String(leg.id)));
  }

  // History: every hour touched by a requested leg
  const hours = new Set<number>();
  for (const leg of legs) {
    for (let h = floorHour(toSeconds(leg.start)); h <= floorHour(toSeconds(leg.end)); h += 3600) {
      hours.add(h);
    }
  }
  const todo = [...hours].sort((a, b) => a - b).filter((h) => !existsSync(paths.dataHour(h)));
  console.log(`History: ${hours.size} hours, ${todo.length} to fetch`);

  for (let i = 0; i < todo.length; i += BATCH_SIZE) {
    const batch = todo.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (h) => {
        try {
          writeGzJson(paths.dataHour(h), await http.getDataHour(eventId, h));
        } catch (err) {
          console.error(`  hour ${h} failed:`, err);
          missing.push(`data2 ${h}`);
        }
      }),
    );
    console.log(`  ${Math.min(i + BATCH_SIZE, todo.length)}/${todo.length}`);
  }

  // Wind: whole UTC days spanning all recorded legs plus the 4 h forecast window
  const startDate = utcDate(Math.min(...recordedLegs.map((l) => toSeconds(l.start))));
  const endDate = utcDate(Math.max(...recordedLegs.map((l) => toSeconds(l.end))) + WIND_LOOKAHEAD_S);
  for (const model of WIND_MODELS) {
    try {
      const byRegion: Record<string, WindPoint[]> = {};
      for (const region of REGIONS) {
        byRegion[region.name] = await getWindHistory(model, region, startDate, endDate);
        await sleep(300);
      }
      writeGzJson(paths.wind(model), byRegion);
      console.log(`Wind ${model}: ${startDate}..${endDate}`);
    } catch (err) {
      console.error(`Wind ${model} failed:`, err);
      missing.push(`wind ${model}`);
    }
  }

  const manifest: Manifest = {
    slug,
    eventId: event.cc_event_id,
    legIds: recordedLegIds,
    recordedAt: new Date().toISOString(),
  };
  writeJson(paths.manifest, manifest);

  if (missing.length > 0) {
    console.error(`Incomplete, missing: ${missing.join(", ")}. Re-run to retry.`);
    process.exit(1);
  }
  console.log(`Done: ${slug}, legs ${recordedLegIds.join(", ")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 3: Add the npm script to `server/package.json`**

In `"scripts"` add after `"start"`:

```json
    "record": "tsx src/scripts/record.ts"
```

- [ ] **Step 4: Ignore unversioned fixtures**

Append to `.gitignore` (after the `*.db-shm` line):

```
# Recorded replay fixtures (only vr-2026 is versioned)
server/fixtures/*
!server/fixtures/vr-2026/
```

Append to `.dockerignore`:

```
server/fixtures
```

- [ ] **Step 5: Type-check, then verify bad arguments are rejected**

Run: `server/node_modules/.bin/tsc -p server/tsconfig.json --noEmit`
Expected: exit 0.

Run: `npm --prefix server run record`
Expected: `Usage: npm --prefix server run record -- <slug> [--legs <id,id>]`, non-zero exit.

Run: `npm --prefix server run record -- vr-2026 --legs 1`
Expected: `No matching legs. Available: 20151424 (VR 2026 - Etapa 1), 20151425 (VR 2026 - Etapa 2)`, non-zero exit. (It must not leave a `server/fixtures/vr-2026` directory behind — check with `ls server/fixtures 2>&1`.)

- [ ] **Step 6: Record vr-2026 Leg 2**

Run: `npm --prefix server run record -- vr-2026 --legs 20151425`
Expected: `History: 15 hours, 15 to fetch`, progress lines, `Wind icon_2i: 2026-04-02..2026-04-03`, `Wind ecmwf: 2026-04-02..2026-04-03`, `Done: vr-2026, legs 20151425`.

- [ ] **Step 7: Verify fixture contents and size**

```bash
du -sh server/fixtures/vr-2026; ls server/fixtures/vr-2026/data2 | wc -l; cat server/fixtures/vr-2026/manifest.json
python3 -c "
import gzip,json
w=json.load(gzip.open('server/fixtures/vr-2026/wind/ecmwf.json.gz'))
print(list(w), len(w['south']), w['south'][0]['hourly']['time'][:2], len(w['south'][0]['hourly']['time']))
d=json.load(gzip.open('server/fixtures/vr-2026/data2/1775124000.json.gz'))
print(len(d), sorted(next(iter(d.values()))[0]))"
git status --short server/fixtures | head -3
```
Expected: size ≈ 2–3 MB; `15`; manifest with `"legIds": [20151425]`; `['south', 'middle', 'north'] 96 ['2026-04-02T00:00', '2026-04-02T01:00'] 48`; `42 [...]` slim keys; git status lists `server/fixtures/vr-2026/` as untracked (not ignored).

- [ ] **Step 8: Verify re-run is resumable**

Run: `npm --prefix server run record -- vr-2026 --legs 20151425`
Expected: `History: 15 hours, 0 to fetch`, `Done`.

- [ ] **Step 9: Lint and commit**

Run: `npx eslint server/src` → no errors.

```bash
git add .gitignore .dockerignore server/package.json server/src/upstream/fixtures.ts server/src/scripts/record.ts server/fixtures/vr-2026
git commit -m "Add event recorder and vr-2026 Leg 2 fixture

npm --prefix server run record -- <slug> [--legs <ids>] captures event
config, leg marks, hourly history and historical wind into
server/fixtures/<slug>/.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Server virtual clock, `/api/clock`, race-time call sites

**Files:**
- Create: `server/src/clock.ts`, `server/src/routes/clock.ts`
- Modify: `server/src/upstream/fixtures.ts`, `server/src/index.ts`, `server/src/routes/data2.ts`, `server/src/routes/wind.ts`

**Interfaces:**
- Consumes: `fixturePaths`, `readJson`, `existsSync`, `Manifest` (Task 2); `RawEvent`, `RawEventLeg` (Task 1); `floorHour` (Task 1).
- Produces:
  - `interface Fixture { manifest: Manifest; event: RawEvent; legs: RawEventLeg[] }`, `loadFixture(slug): Fixture` (throws with a "record it with …" message if missing) — `server/src/upstream/fixtures.ts`
  - `replay: { slug: string; start: number; end: number; speed: number; legIds: number[] } | null`, `now(): number` (ms), `nowSeconds(): number` — `server/src/clock.ts`
  - `GET /api/clock` → `{ now: number /* ms */, speed: number, end: number | null /* ms */, replay: string | null }`

- [ ] **Step 1: Add `loadFixture` to `server/src/upstream/fixtures.ts`**

Change the types import line to:

```ts
import type { RawEvent, RawEventLeg, WindModel } from "./types.js";
```

Append:

```ts
export interface Fixture {
  manifest: Manifest;
  event: RawEvent;
  /** Event legs limited to the ones actually recorded. */
  legs: RawEventLeg[];
}

export function loadFixture(slug: string): Fixture {
  const paths = fixturePaths(slug);
  if (!existsSync(paths.manifest)) {
    throw new Error(
      `No fixture for "${slug}" in ${paths.dir}. Record it with: npm --prefix server run record -- ${slug}`,
    );
  }
  const manifest = readJson<Manifest>(paths.manifest);
  const event = readJson<RawEvent>(paths.event);
  const legs = (event.cc_event_leg ?? []).filter((l) => manifest.legIds.includes(l.id));
  return { manifest, event, legs };
}
```

- [ ] **Step 2: Create `server/src/clock.ts`**

```ts
import { loadFixture } from "./upstream/fixtures.js";

/**
 * Race-time clock. Outside replay it is the wall clock. With REPLAY=<slug> it
 * starts at REPLAY_START (default: 30 min into the first recorded leg), runs at
 * REPLAY_SPEED× and stops at the end of the last recorded leg.
 *
 * Use now() for "what time is it in the race"; keep Date.now() for cache ages.
 */

const DEFAULT_START_OFFSET_MS = 30 * 60 * 1000;

function initReplay(slug: string) {
  const { legs } = loadFixture(slug);
  if (legs.length === 0) throw new Error(`Fixture "${slug}" has no recorded legs`);

  const firstStart = Math.min(...legs.map((l) => Date.parse(l.start)));
  const end = Math.max(...legs.map((l) => Date.parse(l.end)));
  const start = process.env.REPLAY_START
    ? Date.parse(process.env.REPLAY_START)
    : firstStart + DEFAULT_START_OFFSET_MS;
  const speed = Number(process.env.REPLAY_SPEED ?? "1");

  if (Number.isNaN(start)) throw new Error(`Invalid REPLAY_START: ${process.env.REPLAY_START}`);
  if (!(speed > 0)) throw new Error(`Invalid REPLAY_SPEED: ${process.env.REPLAY_SPEED}`);

  return { slug, start, end, speed, legIds: legs.map((l) => l.id) };
}

export const replay = process.env.REPLAY ? initReplay(process.env.REPLAY) : null;

const bootMs = Date.now();

/** Race time in ms. */
export function now(): number {
  if (!replay) return Date.now();
  return Math.min(replay.start + (Date.now() - bootMs) * replay.speed, replay.end);
}

/** Race time in whole unix seconds. */
export function nowSeconds(): number {
  return Math.floor(now() / 1000);
}
```

- [ ] **Step 3: Create `server/src/routes/clock.ts`**

```ts
import { Router } from "express";
import * as clock from "../clock.js";

const router = Router();

router.get("/", (_req, res) => {
  res.json({
    now: clock.now(),
    speed: clock.replay?.speed ?? 1,
    end: clock.replay?.end ?? null,
    replay: clock.replay?.slug ?? null,
  });
});

export default router;
```

- [ ] **Step 4: Wire the clock into `server/src/index.ts`**

Add imports:

```ts
import clockRouter from "./routes/clock.js";
import * as clock from "./clock.js";
```

Register the route next to the others:

```ts
app.use("/api/clock", clockRouter);
```

In the `app.listen` callback, log replay mode first:

```ts
  if (clock.replay) {
    const { slug, legIds, start, speed } = clock.replay;
    console.log(`REPLAY ${slug} (legs ${legIds.join(", ")}) from ${new Date(start).toISOString()} at ×${speed}`);
  }
```

In `tryWarmCache`, replace `const slug = process.env.EVENT_SLUG;` with:

```ts
    const slug = clock.replay?.slug ?? process.env.EVENT_SLUG;
```

and replace `const now = Date.now();` (active-leg detection) with:

```ts
    const now = clock.now();
```

- [ ] **Step 5: Race-time completeness in `server/src/routes/data2.ts`**

This fixes an existing bug: a future hour (prefetched by the client) was cached as "historical" — permanently, and in SQLite — while still empty. A chunk is now *complete* only if its hour had fully elapsed in race time when fetched.

Add import:

```ts
import * as clock from "../clock.js";
```

Replace `interface CacheChunk`:

```ts
interface CacheChunk {
  objects: DataHour;
  fetchedAt: number;
  /** The hour had fully elapsed (race time) when fetched, so the data can't change. */
  complete: boolean;
}
```

Replace `loadFromDb` with:

```ts
// Load all existing chunks from SQLite into memory on startup
function loadFromDb() {
  const rows = db.prepare("SELECT event_id, hour_start, data, fetched_at FROM chunks").all() as { event_id: string; hour_start: number; data: string; fetched_at: number }[];

  let count = 0;
  for (const row of rows) {
    // Older versions persisted hours fetched before they ended; ignore those
    if (row.fetched_at < (row.hour_start + 3600) * 1000) continue;
    const key = `${row.event_id}:${row.hour_start}`;
    if (!memCache.has(key)) {
      memCache.set(key, {
        objects: JSON.parse(row.data),
        fetchedAt: row.fetched_at,
        complete: true,
      });
      count++;
    }
  }
  if (count > 0) console.log(`Loaded ${count} cached chunks from SQLite`);
}
```

Replace `fetchChunk` with:

```ts
async function fetchChunk(
  eventId: string,
  hourStart: number,
): Promise<CacheChunk | null> {
  const key = `${eventId}:${hourStart}`;
  const existing = memCache.get(key);
  const now = Date.now();

  if (existing && (existing.complete || now - existing.fetchedAt < CURRENT_CHUNK_TTL_MS)) {
    return existing;
  }

  const complete = hourStart + 3600 <= clock.nowSeconds();

  try {
    const objects = await upstream.getDataHour(eventId, hourStart);
    const chunk: CacheChunk = { objects, fetchedAt: now, complete };
    memCache.set(key, chunk);

    // Only finished hours are persisted — current and future hours still change
    if (complete) {
      stmtUpsert.run(eventId, hourStart, JSON.stringify(objects), now);
    }

    return chunk;
  } catch {
    return existing ?? null;
  }
}
```

In `warmCache`, replace `const nowSeconds = Math.floor(Date.now() / 1000);` with:

```ts
  const nowSeconds = clock.nowSeconds();
```

- [ ] **Step 6: Wind cache follows the race hour in `server/src/routes/wind.ts`**

Add imports:

```ts
import * as clock from "../clock.js";
import { floorHour, sleep } from "../time.js";
```

(replacing the existing `import { sleep } from "../time.js";`).

Replace `interface CacheEntry` with:

```ts
interface CacheEntry {
  data: unknown;
  fetchedAt: number;
  /** Race hour the 4-hour window starts at. */
  hour: number;
}
```

In `getGridData`, replace the first two lines' cache check with:

```ts
  const hour = floorHour(clock.nowSeconds());
  const cached = cache.get(model);
  if (cached && cached.hour === hour && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.data;
  }
```

and the `cache.set` call with:

```ts
      cache.set(model, { data, fetchedAt: Date.now(), hour });
```

- [ ] **Step 7: Type-check and verify live mode still works and caches finished hours**

Run: `server/node_modules/.bin/tsc -p server/tsconfig.json --noEmit` → exit 0.

```bash
env PORT=3101 CACHE_DB_PATH=.context/t3.db server/node_modules/.bin/tsx server/src/index.ts > .context/t3.log 2>&1 &
```
After ~3 s:
```bash
curl -s localhost:3101/api/clock; echo
curl -s -o /dev/null -w 'first %{time_total}\n' "localhost:3101/api/data2/201619/chunk?hour=1775124000"
curl -s -o /dev/null -w 'second %{time_total}\n' "localhost:3101/api/data2/201619/chunk?hour=1775124000"
python3 -c "import sqlite3;print(sqlite3.connect('.context/t3.db').execute('select count(*) from chunks').fetchone())"
lsof -ti tcp:3101 | xargs kill
```
Expected: `{"now":<≈ current ms>,"speed":1,"end":null,"replay":null}`; first request ≥ 0.3 s, second < 0.05 s; `(1,)` (finished hour persisted).

- [ ] **Step 8: Verify replay clock and fail-fast configuration (Review Focus 1)**

```bash
env PORT=3101 REPLAY=vr-2026 REPLAY_SPEED=60 CACHE_DB_PATH=.context/t3r.db server/node_modules/.bin/tsx server/src/index.ts > .context/t3r.log 2>&1 &
```
After ~3 s:
```bash
head -1 .context/t3r.log
curl -s localhost:3101/api/clock; echo; sleep 2; curl -s localhost:3101/api/clock; echo
lsof -ti tcp:3101 | xargs kill
env REPLAY=nope server/node_modules/.bin/tsx server/src/index.ts 2>&1 | grep -m1 "No fixture"
env REPLAY=vr-2026 REPLAY_SPEED=0 server/node_modules/.bin/tsx server/src/index.ts 2>&1 | grep -m1 "Invalid REPLAY_SPEED"
env REPLAY=vr-2026 REPLAY_START=garbage server/node_modules/.bin/tsx server/src/index.ts 2>&1 | grep -m1 "Invalid REPLAY_START"
```
Expected:
- `REPLAY vr-2026 (legs 20151425) from 2026-04-02T06:30:00.000Z at ×60`
- two clock responses with `"replay":"vr-2026"`, `"speed":60`, `"end":1775162100000`, and `now` advancing ≈ 120 000 ms between them (first ≈ 1775111400000)
- `No fixture for "nope" in …/server/fixtures/nope. Record it with: npm --prefix server run record -- nope`
- `Error: Invalid REPLAY_SPEED: 0`
- `Error: Invalid REPLAY_START: garbage`

(Those three must exit on their own; if one hangs, the throw isn't reaching startup — fix before continuing.)

Note: in this task `REPLAY` only drives the clock; data still comes from `HttpUpstream` until Task 4.

- [ ] **Step 9: Lint and commit**

Run: `npx eslint server/src` → no errors.

```bash
git add server/src
git commit -m "Add server race clock and /api/clock

Race-time decisions (current hour, cache warming, active leg, wind
window) use clock.now(), which follows REPLAY/REPLAY_START/REPLAY_SPEED
in replay and the wall clock otherwise. History chunks are only treated
as final once their hour has elapsed, fixing empty prefetched hours
being cached and persisted forever.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: ReplayUpstream

**Files:**
- Create: `server/src/upstream/replay.ts`
- Modify: `server/src/upstream/index.ts`, `server/src/routes/data2.ts`, `server/src/index.ts`

**Interfaces:**
- Consumes: `clock.now`, `clock.nowSeconds`, `clock.replay` (Task 3); `loadFixture`, `fixturePaths`, `readJson`, `readGzJson`, `existsSync`, `Fixture` (Tasks 2–3); `floorHour` (Task 1); all `Upstream` types (Task 1).
- Produces: `class ReplayUpstream implements Upstream` (constructor `(slug: string)`); `upstream` singleton now picks it when `REPLAY` is set.

- [ ] **Step 1: Create `server/src/upstream/replay.ts`**

```ts
import * as clock from "../clock.js";
import { floorHour } from "../time.js";
import {
  existsSync,
  fixturePaths,
  loadFixture,
  readGzJson,
  readJson,
  type Fixture,
} from "./fixtures.js";
import {
  UpstreamError,
  type DataHour,
  type RawEvent,
  type RawEventLeg,
  type RawLive,
  type RawTails,
  type SlimPoint,
  type Upstream,
  type WindModel,
  type WindPoint,
  type WindRegion,
} from "./types.js";

const TRACK_LENGTH_S = 10800; // upstream's default tail length (3 h)
const FORECAST_HOURS = 4;

const toSeconds = (iso: string) => Math.floor(Date.parse(iso) / 1000);

function latestPoint(points: SlimPoint[]): SlimPoint | undefined {
  let best: SlimPoint | undefined;
  for (const p of points) {
    if (!best || p.time > best.time) best = p;
  }
  return best;
}

/** Serves a recorded fixture as if the race were live at clock.now(). */
export class ReplayUpstream implements Upstream {
  private readonly fixture: Fixture;
  private readonly paths: ReturnType<typeof fixturePaths>;
  private readonly hours = new Map<number, DataHour>();
  private readonly wind = new Map<WindModel, Record<string, WindPoint[]>>();

  constructor(slug: string) {
    this.fixture = loadFixture(slug);
    this.paths = fixturePaths(slug);
  }

  async getEvent(slug: string): Promise<RawEvent> {
    const { manifest, event, legs } = this.fixture;
    if (slug !== manifest.slug && slug !== String(manifest.eventId)) {
      throw new UpstreamError(404, `Event ${slug} is not recorded`);
    }
    return { ...event, cc_event_leg: legs };
  }

  async getLive(eventId: string): Promise<RawLive> {
    this.assertEvent(eventId);
    const now = clock.nowSeconds();
    const leg = this.currentLeg(now);
    const objects: Record<string, SlimPoint> = {};

    if (leg) {
      // Walk back from the current hour; the first hit per vessel is its latest position
      for (let h = floorHour(now); h >= floorHour(toSeconds(leg.start)); h -= 3600) {
        for (const [vesselId, points] of Object.entries(this.visibleHour(h, now))) {
          if (vesselId in objects) continue;
          const latest = latestPoint(points);
          if (latest) objects[vesselId] = latest;
        }
      }
    }

    return { updateInterval: 10, objects };
  }

  async getTails(eventId: string, legId: string): Promise<RawTails> {
    this.assertEvent(eventId);
    const leg = this.fixture.legs.find((l) => String(l.id) === legId);
    if (!leg) throw new UpstreamError(404, `Leg ${legId} is not recorded`);

    const now = clock.nowSeconds();
    const from = Math.max(toSeconds(leg.start), now - TRACK_LENGTH_S);
    const to = Math.min(now, toSeconds(leg.end));
    const tails: Record<string, number[][]> = {};

    for (let h = floorHour(from); h <= floorHour(to); h += 3600) {
      for (const [vesselId, points] of Object.entries(this.visibleHour(h, now))) {
        for (const p of points) {
          if (p.time < from || p.time > to) continue;
          (tails[vesselId] ??= []).push([p.time, p.coords[0], p.coords[1]]);
        }
      }
    }
    for (const points of Object.values(tails)) {
      points.sort((a, b) => a[0] - b[0]);
    }

    return { beginDate: leg.start, trackLengthMax: TRACK_LENGTH_S, tails };
  }

  async getLeg(eventId: string, legId: string): Promise<unknown> {
    this.assertEvent(eventId);
    const path = this.paths.leg(legId);
    if (!existsSync(path)) throw new UpstreamError(404, `Leg ${legId} is not recorded`);
    return readJson(path);
  }

  async getDataHour(eventId: string, hourStart: number): Promise<DataHour> {
    this.assertEvent(eventId);
    return this.visibleHour(hourStart, clock.nowSeconds());
  }

  async getWind(model: WindModel, region: WindRegion): Promise<WindPoint[]> {
    let byRegion = this.wind.get(model);
    if (!byRegion) {
      const path = this.paths.wind(model);
      if (!existsSync(path)) throw new UpstreamError(404, `No recorded wind for ${model}`);
      byRegion = readGzJson<Record<string, WindPoint[]>>(path);
      this.wind.set(model, byRegion);
    }

    const points = byRegion[region.name];
    if (!points) throw new UpstreamError(404, `No recorded wind for region ${region.name}`);

    // Open-Meteo hourly times are UTC "YYYY-MM-DDTHH:MM"
    const hourKey = new Date(floorHour(clock.nowSeconds()) * 1000).toISOString().slice(0, 16);

    return points.map((p) => {
      const hourly = p.hourly;
      const idx = hourly ? hourly.time.indexOf(hourKey) : -1;
      if (!hourly || idx < 0) throw new UpstreamError(404, `No recorded wind at ${hourKey}`);
      const end = idx + FORECAST_HOURS;
      return {
        ...p,
        hourly: {
          time: hourly.time.slice(idx, end),
          wind_speed_10m: hourly.wind_speed_10m.slice(idx, end),
          wind_direction_10m: hourly.wind_direction_10m.slice(idx, end),
        },
      };
    });
  }

  private assertEvent(eventId: string) {
    if (eventId !== String(this.fixture.manifest.eventId)) {
      throw new UpstreamError(404, `Event ${eventId} is not recorded`);
    }
  }

  /** The latest recorded leg that has started by `now`, if any. */
  private currentLeg(now: number): RawEventLeg | undefined {
    return [...this.fixture.legs]
      .sort((a, b) => toSeconds(a.start) - toSeconds(b.start))
      .filter((l) => toSeconds(l.start) <= now)
      .pop();
  }

  /** Recorded hour as seen at `now`: future hours are empty, the current one is cut at `now`. */
  private visibleHour(hourStart: number, now: number): DataHour {
    if (hourStart > now) return {};
    const data = this.readHour(hourStart);
    if (hourStart + 3600 <= now) return data;

    const visible: DataHour = {};
    for (const [vesselId, points] of Object.entries(data)) {
      const upToNow = points.filter((p) => p.time <= now);
      if (upToNow.length > 0) visible[vesselId] = upToNow;
    }
    return visible;
  }

  private readHour(hourStart: number): DataHour {
    let data = this.hours.get(hourStart);
    if (!data) {
      const path = this.paths.dataHour(hourStart);
      data = existsSync(path) ? readGzJson<DataHour>(path) : {};
      this.hours.set(hourStart, data);
    }
    return data;
  }
}
```

- [ ] **Step 2: Select the implementation in `server/src/upstream/index.ts`**

```ts
import { replay } from "../clock.js";
import { HttpUpstream } from "./http.js";
import { ReplayUpstream } from "./replay.js";
import type { Upstream } from "./types.js";

export const upstream: Upstream = replay ? new ReplayUpstream(replay.slug) : new HttpUpstream();

export * from "./types.js";
```

- [ ] **Step 3: Keep replay out of the real SQLite cache**

In `server/src/routes/data2.ts`, replace the `dbPath` line:

```ts
// Replay serves fixtures; keep its chunks out of the real on-disk cache
const dbPath = clock.replay
  ? ":memory:"
  : resolve(process.env.CACHE_DB_PATH ?? resolve(__dirname, "../../cache.db"));
```

In `server/src/index.ts`, replace `purgeOldChunks();` in the listen callback with:

```ts
  if (!clock.replay) purgeOldChunks();
```

- [ ] **Step 4: Type-check**

Run: `server/node_modules/.bin/tsc -p server/tsconfig.json --noEmit` → exit 0.

- [ ] **Step 5: Verify replay serves everything offline**

Upstream hosts are pointed at a dead port so any accidental network call fails loudly.

```bash
env PORT=3101 REPLAY=vr-2026 REPLAY_SPEED=60 SEESEA_API_URL=http://127.0.0.1:9 OPEN_METEO_URL=http://127.0.0.1:9 server/node_modules/.bin/tsx server/src/index.ts > .context/t4.log 2>&1 &
```
After ~4 s:
```bash
B=localhost:3101/api
curl -s $B/event/vr-2026 | python3 -c "import json,sys;d=json.load(sys.stdin);print(d['eventId'],[l['id'] for l in d['legs']])"
curl -s $B/live/201619 | python3 -c "import json,sys;o=json.load(sys.stdin)['objects'];print(len(o),next(iter(o.values())))"
curl -s $B/tails/201619/20151425 | python3 -c "import json,sys;d=json.load(sys.stdin);t=d['tails'];print(len(t),d['trackLengthMax'],min(p[0] for v in t.values() for p in v),max(p[0] for v in t.values() for p in v),sum(1 for v in t.values() for p in v if len(p)>3))"
curl -s $B/clock | python3 -c "import json,sys;print(json.load(sys.stdin)['now']//1000)"
curl -s $B/wind/ecmwf | python3 -c "import json,sys;d=json.load(sys.stdin);print(len(d),[len(r['points']) for r in d],d[0]['points'][0]['hourly']['time'])"
curl -s -o /dev/null -w '%{http_code}\n' $B/leg/201619/20151425
curl -s -o /dev/null -w '%{http_code}\n' $B/event/vr-2024
sleep 5; curl -s $B/live/201619 | python3 -c "import json,sys;o=json.load(sys.stdin)['objects'];print(next(iter(o.values()))['coords'])"
grep -ci "error\|fail" .context/t4.log
ls server/cache.db 2>&1
lsof -ti tcp:3101 | xargs kill
```
Expected:
- `201619 [20151425]`
- ~42 vessels, first object includes `coords`, `hdg`, `sog`
- 42 tails, `10800`, min time ≥ `1775109600` (leg start), max ≤ clock now; last number > 0 (tails enriched with wind speed)
- clock seconds
- `3 [96, 96, 96] ['2026-04-02T07:00', '2026-04-02T08:00', '2026-04-02T09:00', '2026-04-02T10:00']` (exact hours depend on startup time; first entry = current sim hour)
- `200`, then `404`
- coords differ from the first live call (boats moved ~5 min of race time)
- `0`
- `ls: server/cache.db: No such file or directory` (unless it pre-existed from a normal run — then check its mtime is unchanged)

- [ ] **Step 6: Verify edge behaviour (Review Focus 2–4)**

Leg end (2026-04-02T22:35+02:00 = 1775162100):
```bash
env PORT=3101 REPLAY=vr-2026 REPLAY_START=2026-04-02T22:34:00+02:00 REPLAY_SPEED=60 SEESEA_API_URL=http://127.0.0.1:9 OPEN_METEO_URL=http://127.0.0.1:9 server/node_modules/.bin/tsx server/src/index.ts > .context/t4e.log 2>&1 &
```
After ~4 s:
```bash
curl -s localhost:3101/api/clock; echo
curl -s localhost:3101/api/live/201619 | python3 -c "import json,sys;print(len(json.load(sys.stdin)['objects']))"
curl -s -o /dev/null -w '%{http_code}\n' localhost:3101/api/wind/icon_2i
lsof -ti tcp:3101 | xargs kill
```
Expected: `now` = `1775162100000` (clamped); live > 0 vessels; wind `200`.

Before the leg (2 h early):
```bash
env PORT=3101 REPLAY=vr-2026 REPLAY_START=2026-04-02T06:00:00+02:00 SEESEA_API_URL=http://127.0.0.1:9 OPEN_METEO_URL=http://127.0.0.1:9 server/node_modules/.bin/tsx server/src/index.ts > .context/t4b.log 2>&1 &
```
After ~4 s:
```bash
curl -s -w ' %{http_code}\n' localhost:3101/api/live/201619
curl -s -w ' %{http_code}\n' localhost:3101/api/tails/201619/20151425
lsof -ti tcp:3101 | xargs kill
```
Expected: `{"objects":{}} 200` and `{"beginDate":"2026-04-02T08:00:00+02:00","trackLengthMax":10800,"tails":{}} 200`.

Hour boundary at high speed (×600 → one sim hour per 6 s):
```bash
env PORT=3101 REPLAY=vr-2026 REPLAY_SPEED=600 SEESEA_API_URL=http://127.0.0.1:9 OPEN_METEO_URL=http://127.0.0.1:9 server/node_modules/.bin/tsx server/src/index.ts > .context/t4h.log 2>&1 &
```
After ~4 s:
```bash
W="import json,sys;print(json.load(sys.stdin)[0]['points'][0]['hourly']['time'][0])"
curl -s localhost:3101/api/wind/ecmwf | python3 -c "$W"; sleep 7; curl -s localhost:3101/api/wind/ecmwf | python3 -c "$W"
H=$(python3 -c "import urllib.request,json;print(json.load(urllib.request.urlopen('http://localhost:3101/api/clock'))['now']//1000//3600*3600)")
curl -s "localhost:3101/api/data2/201619/chunk?hour=$H" | python3 -c "import json,sys;o=json.load(sys.stdin)['objects'];print(max(p['time'] for v in o.values() for p in v))"; sleep 2
curl -s "localhost:3101/api/data2/201619/chunk?hour=$H" | python3 -c "import json,sys;o=json.load(sys.stdin)['objects'];print(max(p['time'] for v in o.values() for p in v))"
lsof -ti tcp:3101 | xargs kill
```
Expected: the two wind hours differ (second is later); the second chunk max time equals the first (server TTL 60 s holds the current hour) — then after ≥ 60 s wall it would advance. To confirm advancement, repeat the chunk call after `sleep 61` and expect a larger max time (or `{}`-free next hour).

(The `$(...)` and `H=` syntax above is POSIX; in fish write `set H (python3 -c "...")` and `set W "..."`.)

- [ ] **Step 7: Lint and commit**

Run: `npx eslint server/src` → no errors.

```bash
git add server/src
git commit -m "Serve recorded fixtures as a simulated live race

With REPLAY=<slug> the server answers every upstream call from
server/fixtures/<slug>/ cut at the race clock: live positions and
tails are rebuilt from history, wind is the recorded 4-hour window.
Replay keeps its chunk cache in memory.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Client race clock and chunk-cache fix

**Files:**
- Create: `src/utils/clock.ts`
- Modify: `src/main.tsx`, `src/hooks/useEventConfig.ts`, `src/pages/LivePage.tsx`, `src/hooks/useTailLayer.ts`, `src/utils/windGrid.ts`, `src/hooks/useHistoryData.ts`

**Interfaces:**
- Consumes: `GET /api/clock` → `{ now, speed, end, replay }` (Task 3).
- Produces (from `src/utils/clock.ts`):
  - `initClock(): Promise<void>` — never rejects
  - `now(): number` (ms), `nowSeconds(): number`
  - `getReplay(): { slug: string; speed: number } | null` — stable object reference

- [ ] **Step 1: Create `src/utils/clock.ts`**

```ts
/**
 * Race-time clock, synced once from the server's /api/clock. Outside replay
 * (or if the server can't be reached) it is the wall clock.
 *
 * Use now() for "what time is it in the race"; keep Date.now() for polling
 * backoff and "x seconds ago" text.
 */

interface ClockResponse {
  now: number;
  speed: number;
  end: number | null;
  replay: string | null;
}

interface ReplayInfo {
  slug: string;
  speed: number;
}

let sync: { serverNow: number; syncedAt: number; speed: number; end: number } | null = null;
let replayInfo: ReplayInfo | null = null;

export async function initClock(): Promise<void> {
  try {
    const res = await fetch("/api/clock", { signal: AbortSignal.timeout(2000) });
    if (!res.ok) return;
    const data = (await res.json()) as ClockResponse;
    if (!data.replay) return;
    sync = {
      serverNow: data.now,
      syncedAt: performance.now(),
      speed: data.speed,
      end: data.end ?? Infinity,
    };
    replayInfo = { slug: data.replay, speed: data.speed };
  } catch {
    // Older server or offline: fall back to the wall clock
  }
}

/** Race time in ms. */
export function now(): number {
  if (!sync) return Date.now();
  return Math.min(sync.serverNow + (performance.now() - sync.syncedAt) * sync.speed, sync.end);
}

/** Race time in whole unix seconds. */
export function nowSeconds(): number {
  return Math.floor(now() / 1000);
}

export function getReplay(): ReplayInfo | null {
  return replayInfo;
}
```

- [ ] **Step 2: Sync before first render in `src/main.tsx`**

Add import:

```ts
import { initClock } from "./utils/clock";
```

Replace the `createRoot(...).render(...)` call with:

```tsx
// Sync the race clock before rendering so the first leg/slider decisions use it
initClock().then(() => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
```

- [ ] **Step 3: Use the replay slug in `src/hooks/useEventConfig.ts`**

Add import:

```ts
import { getReplay } from "../utils/clock";
```

Replace `const slug = import.meta.env.VITE_EVENT_SLUG || "vr-2026";` with:

```ts
    // In replay the server only knows the recorded event
    const slug = getReplay()?.slug || import.meta.env.VITE_EVENT_SLUG || "vr-2026";
```

- [ ] **Step 4: Race-time call sites in `src/pages/LivePage.tsx`**

Add import:

```ts
import { now as raceNow } from "../utils/clock";
```

In the `autoLeg` memo replace `const now = Date.now();` with:

```ts
    const now = raceNow();
```

Replace `const nowTime = Math.floor(Date.now() / 1000);` with:

```ts
  const nowTime = Math.floor(raceNow() / 1000);
```

Leave `formatDataAge` and `setLastUpdated(new Date())` on the wall clock.

- [ ] **Step 5: Trail cutoff in `src/hooks/useTailLayer.ts`**

Add import:

```ts
import { now as raceNow } from "../utils/clock";
```

Replace `const cutoff = isHistoryMode ? 0 : Date.now() / 1000 - trailMinutes * 60;` with:

```ts
      const cutoff = isHistoryMode ? 0 : raceNow() / 1000 - trailMinutes * 60;
```

- [ ] **Step 6: Wind cache keyed by race hour in `src/utils/windGrid.ts`**

Add import:

```ts
import { nowSeconds } from "./clock";
```

Replace `interface CacheEntry` with:

```ts
interface CacheEntry {
  hours: CompositeGrid[]; // index 0 = current hour, 1..3 = +1h..+3h forecast
  fetchedAt: number;
  /** Race hour (unix seconds / 3600) the forecast window starts at. */
  hour: number;
}
```

In `fetchWindGrids`, replace the cache check with:

```ts
  const hour = Math.floor(nowSeconds() / 3600);
  const cached = cache.get(model);
  if (cached && cached.hour === hour && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.hours;
  }
```

and the `cache.set` call with:

```ts
  cache.set(model, { hours, fetchedAt: Date.now(), hour });
```

- [ ] **Step 7: Don't keep still-filling hours forever in `src/hooks/useHistoryData.ts`**

Add import:

```ts
import { nowSeconds } from "../utils/clock";
```

Add below the `ChunkData` interface:

```ts
/** The current (or a future) hour keeps growing — refetch it after this long. */
const INCOMPLETE_CHUNK_TTL_MS = 30_000;

interface CachedChunk {
  data: ChunkData;
  expiresAt: number;
}
```

In `class ChunkCache`, replace the `chunks` field, `tryGetChunk`, the `cached` lookup in `getChunk`, and the guard in `prefetch`:

```ts
  private chunks = new Map<string, CachedChunk>();
```

```ts
  private fresh(key: string): ChunkData | undefined {
    const entry = this.chunks.get(key);
    return entry && entry.expiresAt > Date.now() ? entry.data : undefined;
  }

  /** Synchronous cache lookup — returns the chunk or undefined if not cached */
  tryGetChunk(eventId: number, hourStart: number): ChunkData | undefined {
    return this.fresh(this.key(eventId, hourStart));
  }
```

In `getChunk`:

```ts
    const cached = this.fresh(k);
    if (cached) return cached;
```

In `prefetch`:

```ts
    if (this.fresh(k) || this.inflight.has(k)) return;
```

In `fetchChunk`, compute completeness before the request and replace `this.chunks.set(cacheKey, data);`:

```ts
    const complete = hourStart + 3600 <= nowSeconds();
```

(as the first line inside `try`), and:

```ts
      this.chunks.set(cacheKey, {
        data,
        expiresAt: complete ? Infinity : Date.now() + INCOMPLETE_CHUNK_TTL_MS,
      });
```

- [ ] **Step 8: Type-check and lint against baseline**

Run: `npx tsc -b 2>&1 | grep -c "error TS"`
Expected: `5` (baseline; none of them in files changed by this task).

Run: `npx eslint src 2>&1 | grep -c " error "`
Expected: `4` (baseline).

- [ ] **Step 9: Verify the client picks up the replay clock**

Start server (replay) and Vite against it:

```bash
env PORT=3101 REPLAY=vr-2026 REPLAY_SPEED=10 server/node_modules/.bin/tsx server/src/index.ts > .context/t5s.log 2>&1 &
env API_TARGET=http://localhost:3101 npx vite --port 3100 > .context/t5v.log 2>&1 &
```
After ~5 s:
```bash
curl -s localhost:3100/api/clock; echo
npx -y playwright@1.56 screenshot --wait-for-timeout 12000 --viewport-size 1400,900 http://localhost:3100 .context/t5.png
```
Then open `.context/t5.png` (Read tool). Expected: the clock JSON via the Vite proxy shows `"replay":"vr-2026"`; the screenshot shows boats on the Croatian coast with the vessel panel populated (not "Loading live data..."). Keep both servers running for Task 6, or stop them with `lsof -ti tcp:3101 | xargs kill; lsof -ti tcp:3100 | xargs kill`.

- [ ] **Step 10: Commit**

```bash
git add src
git commit -m "Use the server race clock in the client

The client syncs /api/clock once at startup and uses it for leg
detection, slider end, trail cutoff and the wind cache. In replay it
loads the replayed event. History chunks for the still-running hour are
cached for 30 s instead of forever.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Replay badge, docs, end-to-end verification

**Files:**
- Create: `src/components/ReplayBadge.tsx`
- Modify: `src/pages/LivePage.tsx`, `src/App.css`, `.env.example`, `README.md`

**Interfaces:**
- Consumes: `getReplay()`, `now()` from `src/utils/clock.ts` (Task 5).
- Produces: `<ReplayBadge />` (default export, no props; renders nothing outside replay).

- [ ] **Step 1: Create `src/components/ReplayBadge.tsx`**

```tsx
import { useEffect, useState } from "react";
import { getReplay, now } from "../utils/clock";

/** Shows the replayed event, speed and race time while the server runs in replay mode. */
export default function ReplayBadge() {
  const replay = getReplay();
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!replay) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [replay]);

  if (!replay) return null;

  const time = new Date(now()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="replay-badge">
      REPLAY · {replay.slug} · ×{replay.speed} · {time}
    </div>
  );
}
```

- [ ] **Step 2: Render it in `src/pages/LivePage.tsx`**

Add import:

```ts
import ReplayBadge from "../components/ReplayBadge";
```

Directly after the `{lastUpdated && !error && !isHistoryMode && <div className="live-dot" />}` line add:

```tsx
      <ReplayBadge />
```

- [ ] **Step 3: Style it in `src/App.css`**

Add after the `.live-dot { … }` block:

```css
.replay-badge {
  position: absolute;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 10;
  padding: 3px 10px;
  border-radius: 999px;
  background-color: rgba(15, 23, 42, 0.85);
  color: #fbbf24;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  white-space: nowrap;
  pointer-events: none;
}
```

- [ ] **Step 4: Document env vars in `.env.example`**

Append:

```
# --- Dev data / replay (read by the API server) ---
# Replay a recorded event as if it were live (fixtures in server/fixtures/<slug>/)
# REPLAY=vr-2026
# REPLAY_SPEED=10
# REPLAY_START=2026-04-02T12:00:00+02:00
# Upstream overrides
# SEESEA_API_URL=https://app.seesea.cz/api
# OPEN_METEO_URL=https://api.open-meteo.com/v1
```

- [ ] **Step 5: Add a README section**

Append to `README.md`:

````markdown
## Dev data & replay

The API server can replay a recorded event as if it were live, with no network access to SeeSea or Open-Meteo. Leg 2 of VR 2026 is committed in `server/fixtures/vr-2026/`.

Enable it in `.env` (the Conductor run script and `npm --prefix server run dev` both pick it up):

```
REPLAY=vr-2026
REPLAY_SPEED=10                         # optional, default 1
REPLAY_START=2026-04-02T12:00:00+02:00  # optional, default 30 min into the first recorded leg
```

The race clock starts at `REPLAY_START`, runs at `REPLAY_SPEED`× and stops at the end of the last recorded leg. Live positions, tails and wind are rebuilt from the recording for that time, and the UI shows a `REPLAY` badge. Restart the server to change settings.

To record another event (stored in `server/fixtures/<slug>/`, gitignored except `vr-2026`):

```bash
npm --prefix server run record -- <slug> [--legs <legId,legId>]
```

Event slugs and leg ids are listed at `https://app.seesea.cz/api/cc_event/`. Re-running resumes and skips hours already recorded.
````

- [ ] **Step 6: End-to-end verification**

With the Task 5 servers still running (restart them as in Task 5 Step 9 if not):

```bash
npx -y playwright@1.56 screenshot --wait-for-timeout 15000 --viewport-size 1400,900 http://localhost:3100 .context/replay.png
```
Open `.context/replay.png`. Expected: badge `REPLAY · vr-2026 · ×10 · HH:MM` at top centre, not overlapping header controls; boats and tails visible; panel populated. If the badge collides with an existing control, adjust `top` in `.replay-badge` and re-screenshot.

Wait 30 s and screenshot again to `.context/replay2.png`; boats must have moved and the badge time advanced by ~5 min.

Stop both: `lsof -ti tcp:3101 | xargs kill; lsof -ti tcp:3100 | xargs kill`.

Live-mode regression (Review Focus 5):

```bash
env PORT=3101 CACHE_DB_PATH=.context/t6.db server/node_modules/.bin/tsx server/src/index.ts > .context/t6s.log 2>&1 &
env API_TARGET=http://localhost:3101 npx vite --port 3100 > .context/t6v.log 2>&1 &
```
After ~5 s:
```bash
curl -s localhost:3100/api/clock; echo
npx -y playwright@1.56 screenshot --wait-for-timeout 12000 --viewport-size 1400,900 http://localhost:3100 .context/live.png
lsof -ti tcp:3101 | xargs kill; lsof -ti tcp:3100 | xargs kill
```
Expected: `"replay":null`; screenshot shows the app loaded against real upstream with no badge (vr-2026 is finished, so no live boats — same as before this work).

- [ ] **Step 7: Final type-check and lint**

Run: `server/node_modules/.bin/tsc -p server/tsconfig.json --noEmit` → exit 0.
Run: `npx tsc -b 2>&1 | grep -c "error TS"` → `5`.
Run: `npm run lint 2>&1 | grep -c " error "` → `4`.

- [ ] **Step 8: Commit**

```bash
git add src .env.example README.md
git commit -m "Add replay badge and document dev data workflow

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```
