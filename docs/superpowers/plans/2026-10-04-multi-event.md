# Multi-Event Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve a configured list of SeeSea events and let users switch between them via `/e/<slug>` URLs and a header picker, with per-event saved state and wind coverage for the Palagruža course.

**Architecture:** The server reads `EVENTS` into an ordered slug list, caches event configs in one module, and exposes `/api/events`. The client resolves the selected event from the URL against that list and renders everything event-specific inside an `EventScope` keyed by slug, so switching remounts it cleanly.

**Tech Stack:** Node 20 + Express 4 (server, run with `tsx`), React 19 + Vite 6 + Mapbox GL (client), TypeScript 5. No router library.

**Spec:** `docs/superpowers/specs/2026-10-04-multi-event-design.md`

## Global Constraints

- No automated test framework (user deferred tests). Verification = type-check, lint, scripted `curl`, and Playwright screenshots/assertions as given per task.
- Baseline is not clean: client `npx tsc -b` reports 5 errors and `npm run lint` 4 errors on `main`. "Passes" = no errors beyond these. Server `tsc --noEmit` and `npx eslint server/src` must stay clean.
- Env var: `EVENTS` (comma-separated slugs, order kept), fallback `EVENT_SLUG`; in replay the list is `[REPLAY slug]`. `VITE_EVENT_SLUG` is removed.
- Default event: first listed event with `start ≤ clock.now() ≤ end`, else the first listed event.
- Unlisted slug: server `404 {"error": "Event not available"}`; client falls back to the default event.
- URLs: `/e/<slug>`; navigation via `history.pushState`/`replaceState` + `popstate`.
- localStorage keys: `seesea-highlighted-crews:<slug>`, `selectedLegId:<slug>`. Other settings keep their global keys.
- Wind: add region `{ name: "palagruza", minLat: 42.3, maxLat: 43.1, minLng: 15.4, maxLng: 16.5, latSteps: 8, lngSteps: 12 }`.
- Rule from step 1: `clock.now()` for race time, `Date.now()` for cache ages.
- Commit style: sentence-case imperative subject, trailer `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- Background servers: start with `(env … cmd > log 2>&1 &)`, stop with `lsof -ti tcp:<port> | xargs kill`. Ports 3100 (Vite) / 3101 (API).
- Playwright: run scripts via `npm exec --yes --package=playwright@1.56 -- sh -c 'PW_EXE=$HOME/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell NODE_PATH="$(dirname "$(dirname "$(command -v playwright)")")" node <script>'` and launch with `chromium.launch({ executablePath: process.env.PW_EXE })` (the 1.56 default browser build is not installed).

## Review Focus

1. **One listed event fails upstream (typo in `EVENTS`, event deleted)** — `/api/events` must still return the others with HTTP 200 and the app must still load. Pinned in Task 1, Step 8.
2. **Browser back/forward after switching events** — the picker and the map must follow the URL, not stay on the last picked event. Pinned in Task 4, Step 4.
3. **Opening `/` or a stale/unlisted `/e/<slug>` link** — the app lands on the default event and the URL is corrected (no blank page, no extra history entry). Pinned in Task 4, Step 4.
4. **Highlights after switching events and back** — each event keeps its own highlights; unhighlighting all boats in an event must not re-seed defaults on the next visit. Pinned in Task 4, Step 4.
5. **Replay with the new wind region** — replay must not 502 on wind because the fixture lacks the new region. Pinned in Task 2, Step 3.

---

## File Structure

Server:
- Create `server/src/events.ts` — event slug list, shared event-config cache, `isRunning`
- Create `server/src/routes/events.ts` — `GET /api/events`
- Modify `server/src/routes/event.ts` — use shared cache, 404 for unlisted, add `name`/`center`
- Modify `server/src/upstream/types.ts` — typed optional event fields
- Modify `server/src/upstream/regions.ts` — fourth region
- Modify `server/src/index.ts` — register route, multi-event cache warming
- Modify `server/fixtures/vr-2026/wind/*.json.gz` — re-recorded with 4 regions

Client:
- Create `src/utils/route.ts` — path ⇄ slug
- Create `src/hooks/useEvents.ts` — `/api/events` loader, default pick, URL-synced selection
- Create `src/components/EventPicker.tsx` — header picker
- Create `src/components/EventScope.tsx` — per-event subtree (config, highlights, context, `LivePage`)
- Modify `src/App.tsx` — events/route wiring, header picker, `EventScope`
- Modify `src/hooks/useEventConfig.ts` — loader takes `slug`; context gains `slug`, `center`
- Modify `src/hooks/useHighlightedCrews.ts` — per-event key + seeding
- Modify `src/hooks/useMapControls.ts`, `src/pages/LivePage.tsx` — per-event leg key
- Modify `src/components/LiveMap.tsx` — initial center from event
- Modify `src/App.css` — header title + picker styles

Config/docs: `.env.example`, `.conductor/settings.toml`, `docker-compose.yml`, `README.md`

---

### Task 1: Server event list, `/api/events`, wind region

**Files:**
- Create: `server/src/events.ts`, `server/src/routes/events.ts`
- Modify: `server/src/upstream/types.ts`, `server/src/routes/event.ts`, `server/src/upstream/regions.ts`, `server/src/index.ts`, `.env.example`, `.conductor/settings.toml`, `docker-compose.yml`

**Interfaces:**
- Consumes: `upstream.getEvent(slug): Promise<RawEvent>`, `clock.now()`, `clock.replay`, `warmCache(eventId: string, fromTime: number)`, `sendUpstreamError(res, err, message)` (all existing).
- Produces:
  - `EVENT_SLUGS: string[]`, `isListedEvent(slug: string): boolean`, `getEventConfig(slug: string): Promise<EventConfig>`, `isRunning(config: EventConfig, now?: number): boolean`, `interface EventConfig { slug: string; eventId: number; name: string; start: string; end: string; center: [number, number] | null; crews: unknown[]; legs: RawEventLeg[] }` — `server/src/events.ts`
  - `GET /api/events` → `Array<{ slug: string; name: string; start: string; end: string; running: boolean; center: [number, number] | null }>`
  - `GET /api/event/:slug` → `{ eventId, name, center, crews, legs }`, or `404 {"error":"Event not available"}`

- [ ] **Step 1: RED — confirm `/api/events` doesn't exist and the wind has 3 regions**

```bash
(env PORT=3101 EVENT_SLUG=vr-2026 CACHE_DB_PATH=.context/me1.db server/node_modules/.bin/tsx server/src/index.ts > .context/me1.log 2>&1 &); sleep 4
curl -s -o /dev/null -w 'events %{http_code}\n' localhost:3101/api/events
curl -s localhost:3101/api/wind/ecmwf | python3 -c "import json,sys;print('regions',len(json.load(sys.stdin)))"
lsof -ti tcp:3101 | xargs kill
```
Expected: `events 404`, `regions 3`.

- [ ] **Step 2: Type the event fields in `server/src/upstream/types.ts`**

Replace `interface RawEvent`:

```ts
export interface RawEvent {
  cc_event_id: number;
  slug: string;
  name?: string;
  event_start?: string;
  event_end?: string;
  default_lat?: number;
  default_lng?: number;
  cc_object?: unknown[];
  cc_event_leg?: RawEventLeg[];
  [key: string]: unknown;
}
```

- [ ] **Step 3: Create `server/src/events.ts`**

```ts
import * as clock from "./clock.js";
import { upstream, type RawEventLeg } from "./upstream/index.js";

/** Events offered by this server, in display order. Replay serves only the recorded event. */
export const EVENT_SLUGS: string[] = (
  clock.replay ? clock.replay.slug : (process.env.EVENTS ?? process.env.EVENT_SLUG ?? "")
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export function isListedEvent(slug: string): boolean {
  return EVENT_SLUGS.includes(slug);
}

export interface EventConfig {
  slug: string;
  eventId: number;
  name: string;
  start: string;
  end: string;
  /** [lng, lat] the map opens at. */
  center: [number, number] | null;
  crews: unknown[];
  legs: RawEventLeg[];
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const cache = new Map<string, { config: EventConfig; fetchedAt: number }>();

export async function getEventConfig(slug: string): Promise<EventConfig> {
  const cached = cache.get(slug);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.config;

  const data = await upstream.getEvent(slug);
  const config: EventConfig = {
    slug,
    eventId: data.cc_event_id,
    name: data.name ?? slug,
    start: data.event_start ?? "",
    end: data.event_end ?? "",
    center:
      typeof data.default_lng === "number" && typeof data.default_lat === "number"
        ? [data.default_lng, data.default_lat]
        : null,
    crews: data.cc_object ?? [],
    legs: data.cc_event_leg ?? [],
  };

  cache.set(slug, { config, fetchedAt: Date.now() });
  return config;
}

/** Whether the event is on at race time `now` (ms). */
export function isRunning(config: EventConfig, now = clock.now()): boolean {
  return Date.parse(config.start) <= now && now <= Date.parse(config.end);
}
```

- [ ] **Step 4: Create `server/src/routes/events.ts`**

```ts
import { Router } from "express";
import * as clock from "../clock.js";
import { EVENT_SLUGS, getEventConfig, isRunning, type EventConfig } from "../events.js";

const router = Router();

router.get("/", async (_req, res) => {
  const configs = await Promise.all(
    EVENT_SLUGS.map(async (slug) => {
      try {
        return await getEventConfig(slug);
      } catch (err) {
        // One broken slug must not take the picker down
        console.warn(`Event ${slug} unavailable:`, err instanceof Error ? err.message : err);
        return null;
      }
    }),
  );

  const now = clock.now();
  res.json(
    configs
      .filter((c): c is EventConfig => c !== null)
      .map((c) => ({
        slug: c.slug,
        name: c.name,
        start: c.start,
        end: c.end,
        running: isRunning(c, now),
        center: c.center,
      })),
  );
});

export default router;
```

- [ ] **Step 5: Rewrite `server/src/routes/event.ts`**

```ts
import { Router } from "express";
import { getEventConfig, isListedEvent } from "../events.js";
import { sendUpstreamError } from "./upstreamError.js";

const router = Router();

router.get("/:slug", async (req, res) => {
  const { slug } = req.params;

  if (!isListedEvent(slug)) {
    res.status(404).json({ error: "Event not available" });
    return;
  }

  try {
    const config = await getEventConfig(slug);
    res.json({
      eventId: config.eventId,
      name: config.name,
      center: config.center,
      crews: config.crews,
      legs: config.legs,
    });
  } catch (err) {
    sendUpstreamError(res, err, "Failed to fetch event config");
  }
});

export default router;
```

- [ ] **Step 6: Wire into `server/src/index.ts`**

Add imports:

```ts
import eventsRouter from "./routes/events.js";
import { EVENT_SLUGS, getEventConfig } from "./events.js";
```

Remove the now-unused `import { upstream } from "./upstream/index.js";`.

Register next to `/api/event`:

```ts
app.use("/api/events", eventsRouter);
```

Replace the whole `tryWarmCache` function:

```ts
async function tryWarmCache() {
  if (EVENT_SLUGS.length === 0) {
    console.log("No EVENTS set, skipping cache warming");
    return;
  }

  for (const slug of EVENT_SLUGS) {
    try {
      const { eventId, legs } = await getEventConfig(slug);

      const now = clock.now();
      const activeLeg = legs
        .filter((l) => l.active === 1)
        .find((l) => new Date(l.start).getTime() <= now && new Date(l.end).getTime() >= now);

      if (!activeLeg) {
        console.log(`No running leg for ${slug}, skipping cache warming`);
        continue;
      }

      const legStart = Math.floor(new Date(activeLeg.start).getTime() / 1000);
      console.log(`Warming cache for ${slug} (event ${eventId}) from leg start ${activeLeg.start}`);
      await warmCache(String(eventId), legStart);
    } catch (err) {
      console.error(`Cache warming failed for ${slug}:`, err);
    }
  }
}
```

- [ ] **Step 7: Add the wind region in `server/src/upstream/regions.ts`**

Append to the `REGIONS` array, after `north`:

```ts
  {
    name: "palagruza", // Open sea from Murter/Šibenik down to Palagruža
    minLat: 42.3, maxLat: 43.1,
    minLng: 15.4, maxLng: 16.5,
    latSteps: 8, lngSteps: 12,
  },
```

- [ ] **Step 8: Verify the server (incl. Review Focus 1)**

Run: `server/node_modules/.bin/tsc -p server/tsconfig.json --noEmit && npx eslint server/src && echo clean` → `clean`.

```bash
(env PORT=3101 EVENTS=vr-2026,seawolf-cup-36,no-such-event,cany-offshore-cup-2026 CACHE_DB_PATH=.context/me1.db server/node_modules/.bin/tsx server/src/index.ts > .context/me1.log 2>&1 &); sleep 4
curl -s localhost:3101/api/events | python3 -c "import json,sys;[print(e['slug'],e['name'],e['running'],e['center']) for e in json.load(sys.stdin)]"
curl -s localhost:3101/api/event/cany-offshore-cup-2026 | python3 -c "import json,sys;d=json.load(sys.stdin);print(d['eventId'],d['name'],d['center'],len(d['crews']))"
curl -s -w ' %{http_code}\n' localhost:3101/api/event/vr-2024
curl -s localhost:3101/api/wind/ecmwf | python3 -c "import json,sys;d=json.load(sys.stdin);print('regions',len(d),[len(r['points']) for r in d])"
grep -E "unavailable|No running leg|No EVENTS" .context/me1.log
lsof -ti tcp:3101 | xargs kill
(env PORT=3101 CACHE_DB_PATH=.context/me1.db server/node_modules/.bin/tsx server/src/index.ts > .context/me1b.log 2>&1 &); sleep 3
curl -s localhost:3101/api/events; echo; grep "No EVENTS" .context/me1b.log
lsof -ti tcp:3101 | xargs kill
```
Expected:
- three lines in order: `vr-2026 VR 2026 False [15.589516, 43.826011]`, `seawolf-cup-36 … False [15.59988, 43.828721]`, `cany-offshore-cup-2026 … False [11.770708, 54.158968]` (no `no-such-event` line)
- `<id> <name> [11.770708, 54.158968] <n>`
- `{"error":"Event not available"} 404`
- `regions 4 [96, 96, 96, 96]`
- log contains `Event no-such-event unavailable: …` and `No running leg for …` lines
- second server: `[]` and `No EVENTS set, skipping cache warming`

- [ ] **Step 9: Config plumbing**

`.env.example` — replace the two lines

```
# SeeSea event slug (used to fetch event config from upstream)
VITE_EVENT_SLUG=vr-2026
```

with

```
# SeeSea events offered in the app (comma-separated slugs, read by the API server).
# The first running one is the default; see https://app.seesea.cz/api/cc_event/
EVENTS=vr-2026
```

`.conductor/settings.toml` — in the run command replace

```
"PORT=$API_PORT EVENT_SLUG=${VITE_EVENT_SLUG:-vr-2026} npm --prefix server run dev"
```

with

```
"PORT=$API_PORT EVENTS=${EVENTS:-vr-2026} npm --prefix server run dev"
```

`docker-compose.yml` — delete the app's `- VITE_EVENT_SLUG=${VITE_EVENT_SLUG}` line and replace the server's `- EVENT_SLUG=${VITE_EVENT_SLUG}` with:

```yaml
      - EVENTS=${EVENTS:-vr-2026}
```

- [ ] **Step 10: Commit**

```bash
git add server/src .env.example .conductor/settings.toml docker-compose.yml
git commit -m "Serve a configured list of events

EVENTS (comma-separated slugs, falling back to EVENT_SLUG) lists the
events the server offers; /api/events returns them with name, dates,
running state and map center, and /api/event/:slug 404s for anything
else. Cache warming covers every listed event, and a fourth wind
region covers the open sea down to Palagruža.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Re-record vr-2026 wind for four regions

**Files:**
- Modify: `server/fixtures/vr-2026/wind/ecmwf.json.gz`, `server/fixtures/vr-2026/wind/icon_2i.json.gz`

**Interfaces:**
- Consumes: recorder `npm --prefix server run record -- <slug> --legs <ids>` (existing; it skips wind only if the files exist), `REGIONS` with `palagruza` (Task 1).
- Produces: wind fixtures keyed by `south`, `middle`, `north`, `palagruza`.

- [ ] **Step 1: RED — replay wind fails with the new region**

```bash
(env PORT=3101 REPLAY=vr-2026 SEESEA_API_URL=http://127.0.0.1:9 OPEN_METEO_URL=http://127.0.0.1:9 server/node_modules/.bin/tsx server/src/index.ts > .context/me2.log 2>&1 &); sleep 4
curl -s -w ' %{http_code}\n' localhost:3101/api/wind/ecmwf | tail -c 80
lsof -ti tcp:3101 | xargs kill
```
Expected: `{"error":"Failed to fetch wind data"} 502`.

- [ ] **Step 2: Re-record the wind**

```bash
rm server/fixtures/vr-2026/wind/ecmwf.json.gz server/fixtures/vr-2026/wind/icon_2i.json.gz
npm --prefix server run record -- vr-2026 --legs 20151425 2>&1 | grep -E 'History|Wind|Done|Incomplete'
git checkout server/fixtures/vr-2026/event.json server/fixtures/vr-2026/manifest.json
python3 -c "import gzip,json;w=json.load(gzip.open('server/fixtures/vr-2026/wind/ecmwf.json.gz'));print(list(w),[len(v) for v in w.values()])"
```
Expected: `History: 15 hours, 0 to fetch`, `Wind icon_2i: 2026-04-02..2026-04-03`, `Wind ecmwf: …`, `Done`; then `['south', 'middle', 'north', 'palagruza'] [96, 96, 96, 96]`. (If Open-Meteo answers 429, wait a minute and re-run the `npm` line.) The `git checkout` drops the incidental rewrite of `event.json` (upstream rotates banners) and `manifest.json` (`recordedAt`).

- [ ] **Step 3: GREEN — replay wind works offline (Review Focus 5)**

```bash
(env PORT=3101 REPLAY=vr-2026 SEESEA_API_URL=http://127.0.0.1:9 OPEN_METEO_URL=http://127.0.0.1:9 server/node_modules/.bin/tsx server/src/index.ts > .context/me2.log 2>&1 &); sleep 4
curl -s localhost:3101/api/wind/ecmwf | python3 -c "import json,sys;d=json.load(sys.stdin);print('regions',len(d),d[3]['points'][0]['hourly']['time'][:2])"
curl -s localhost:3101/api/events | python3 -c "import json,sys;print([(e['slug'],e['running']) for e in json.load(sys.stdin)])"
lsof -ti tcp:3101 | xargs kill
git status --short server/fixtures
```
Expected: `regions 4 ['2026-04-02T06:00', '2026-04-02T07:00']`; `[('vr-2026', True)]`; only the two wind files modified.

- [ ] **Step 4: Commit**

```bash
git add server/fixtures/vr-2026/wind
git commit -m "Re-record vr-2026 wind with the Palagruža region

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Client event list, URL routing, picker and event scope

**Files:**
- Create: `src/utils/route.ts`, `src/hooks/useEvents.ts`, `src/components/EventPicker.tsx`, `src/components/EventScope.tsx`
- Modify: `src/App.tsx`, `src/hooks/useEventConfig.ts`, `src/hooks/useHighlightedCrews.ts`, `src/App.css`

**Interfaces:**
- Consumes: `GET /api/events` and `GET /api/event/:slug` (Task 1); `LivePage` props `{ panelCollapsed, onTogglePanel, controlsOpen, onToggleControls }` (existing); `HIGHLIGHTED_BOATS` (existing).
- Produces:
  - `getEventSlugFromPath(pathname?: string): string | null`, `eventPath(slug: string): string` — `src/utils/route.ts`
  - `interface EventSummary { slug: string; name: string; start: string; end: string; running: boolean; center: [number, number] | null }`, `useEvents(): { events: EventSummary[] | null; error: string | null }`, `pickDefaultEvent(events: EventSummary[]): EventSummary | undefined`, `useEventRoute(events: EventSummary[] | null): { selected: EventSummary | undefined; selectEvent: (slug: string) => void }` — `src/hooks/useEvents.ts`
  - `EventConfigContext` value gains `slug: string` and `center: [number, number] | null`; `useEventConfigLoader(slug: string)` — `src/hooks/useEventConfig.ts`
  - `useHighlightedCrews(slug: string, crews: Crew[])` — `src/hooks/useHighlightedCrews.ts`
  - `<EventScope event={EventSummary} … LivePage props />`, `<EventPicker events selected onSelect />`

- [ ] **Step 1: Create `src/utils/route.ts`**

```ts
const EVENT_PATH = /^\/e\/([^/]+)\/?$/;

/** Event slug from a `/e/<slug>` path, or null for any other path. */
export function getEventSlugFromPath(pathname = window.location.pathname): string | null {
  const match = pathname.match(EVENT_PATH);
  return match ? decodeURIComponent(match[1]) : null;
}

export function eventPath(slug: string): string {
  return `/e/${encodeURIComponent(slug)}`;
}
```

- [ ] **Step 2: Create `src/hooks/useEvents.ts`**

```ts
import { useCallback, useEffect, useState } from "react";
import { eventPath, getEventSlugFromPath } from "../utils/route";

export interface EventSummary {
  slug: string;
  name: string;
  start: string;
  end: string;
  running: boolean;
  /** [lng, lat] the map opens at. */
  center: [number, number] | null;
}

export function useEvents() {
  const [events, setEvents] = useState<EventSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/events")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<EventSummary[]>;
      })
      .then(setEvents)
      .catch((err: Error) => setError(err.message));
  }, []);

  return { events, error };
}

/** First running event, else the first listed one. */
export function pickDefaultEvent(events: EventSummary[]): EventSummary | undefined {
  return events.find((e) => e.running) ?? events[0];
}

/**
 * The event shown is the one in the URL (`/e/<slug>`) if listed, else the default.
 * The URL is corrected in place for `/` or unlisted slugs; picking an event pushes
 * a history entry, and back/forward switch events.
 */
export function useEventRoute(events: EventSummary[] | null) {
  const [pathSlug, setPathSlug] = useState(() => getEventSlugFromPath());

  useEffect(() => {
    const onPopState = () => setPathSlug(getEventSlugFromPath());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const selected = events
    ? (events.find((e) => e.slug === pathSlug) ?? pickDefaultEvent(events))
    : undefined;

  useEffect(() => {
    if (selected && selected.slug !== pathSlug) {
      window.history.replaceState(null, "", eventPath(selected.slug));
      setPathSlug(selected.slug);
    }
  }, [selected, pathSlug]);

  const selectEvent = useCallback((slug: string) => {
    if (slug === getEventSlugFromPath()) return;
    window.history.pushState(null, "", eventPath(slug));
    setPathSlug(slug);
  }, []);

  return { selected, selectEvent };
}
```

- [ ] **Step 3: Make the event config loader take a slug in `src/hooks/useEventConfig.ts`**

Remove `import { getReplay } from "../utils/clock";`.

Replace `interface EventConfig` and the context default:

```ts
interface EventConfig extends EventConfigBase {
  slug: string;
  /** [lng, lat] the map opens at. */
  center: [number, number] | null;
  highlightedCrews: Set<number>;
  toggleHighlight: (crewId: number) => void;
}

export const EventConfigContext = createContext<EventConfig>({
  slug: "",
  center: null,
  eventId: null,
  crews: [],
  legs: [],
  loading: true,
  error: null,
  highlightedCrews: new Set(),
  toggleHighlight: () => {},
});
```

Change the loader signature and effect:

```ts
export function useEventConfigLoader(slug: string): EventConfigBase {
```

Inside, delete the two lines `// In replay the server only knows the recorded event` and `const slug = getReplay()?.slug || import.meta.env.VITE_EVENT_SLUG || "vr-2026";`, and change the effect's dependency array from `[]` to `[slug]`.

- [ ] **Step 4: Per-event highlights with one-time seeding — rewrite `src/hooks/useHighlightedCrews.ts`**

```ts
import { useCallback, useEffect, useState } from "react";
import { HIGHLIGHTED_BOATS } from "../config";
import type { Crew } from "./useEventConfig";

const STORAGE_PREFIX = "seesea-highlighted-crews:";

/** Saved highlights for an event, or null if the event was never opened. */
function loadHighlighted(key: string): Set<number> | null {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? null : new Set(JSON.parse(raw) as number[]);
  } catch {
    return null;
  }
}

function saveHighlighted(key: string, ids: Set<number>) {
  localStorage.setItem(key, JSON.stringify([...ids]));
}

export function useHighlightedCrews(slug: string, crews: Crew[]) {
  const key = STORAGE_PREFIX + slug;
  const [highlightedCrews, setHighlightedCrews] = useState<Set<number>>(
    () => loadHighlighted(key) ?? new Set(),
  );

  // First visit to this event: seed the default boats once its crews are known
  useEffect(() => {
    if (crews.length === 0 || loadHighlighted(key) !== null) return;
    const seeded = new Set(crews.filter((c) => HIGHLIGHTED_BOATS.includes(c.name)).map((c) => c.id));
    saveHighlighted(key, seeded);
    setHighlightedCrews(seeded);
  }, [crews, key]);

  const toggleHighlight = useCallback((crewId: number) => {
    setHighlightedCrews((prev) => {
      const next = new Set(prev);
      if (next.has(crewId)) {
        next.delete(crewId);
      } else {
        next.add(crewId);
      }
      saveHighlighted(key, next);
      return next;
    });
  }, [key]);

  return { highlightedCrews, toggleHighlight };
}
```

- [ ] **Step 5: Create `src/components/EventScope.tsx`**

```tsx
import { EventConfigContext, useEventConfigLoader } from "../hooks/useEventConfig";
import { useHighlightedCrews } from "../hooks/useHighlightedCrews";
import type { EventSummary } from "../hooks/useEvents";
import { LivePage } from "../pages/LivePage";

interface EventScopeProps {
  event: EventSummary;
  panelCollapsed: boolean;
  onTogglePanel: () => void;
  controlsOpen: boolean;
  onToggleControls: () => void;
}

/**
 * Everything specific to one event. Rendered with `key={slug}` so switching
 * events remounts it — no state (map, caches in hooks, highlights) leaks across.
 */
export default function EventScope({ event, ...pageProps }: EventScopeProps) {
  const config = useEventConfigLoader(event.slug);
  const { highlightedCrews, toggleHighlight } = useHighlightedCrews(event.slug, config.crews);

  return (
    <EventConfigContext.Provider
      value={{ ...config, slug: event.slug, center: event.center, highlightedCrews, toggleHighlight }}
    >
      <LivePage {...pageProps} />
    </EventConfigContext.Provider>
  );
}
```

- [ ] **Step 6: Create `src/components/EventPicker.tsx`**

```tsx
import type { EventSummary } from "../hooks/useEvents";

interface EventPickerProps {
  events: EventSummary[];
  selected: EventSummary;
  onSelect: (slug: string) => void;
}

const label = (e: EventSummary) => (e.running ? `● ${e.name}` : e.name);

export default function EventPicker({ events, selected, onSelect }: EventPickerProps) {
  if (events.length === 1) {
    return <span className="event-picker">{label(selected)}</span>;
  }

  return (
    <select
      className="event-picker"
      aria-label="Event"
      value={selected.slug}
      onChange={(e) => onSelect(e.target.value)}
    >
      {events.map((e) => (
        <option key={e.slug} value={e.slug}>
          {label(e)}
        </option>
      ))}
    </select>
  );
}
```

- [ ] **Step 7: Rewrite `src/App.tsx`**

```tsx
import { useCallback, useState } from "react";
import { Sailboat, SlidersHorizontal } from "lucide-react";
import "./App.css";
import { useEventRoute, useEvents } from "./hooks/useEvents";
import EventPicker from "./components/EventPicker";
import EventScope from "./components/EventScope";

function App() {
  const { events, error: eventsError } = useEvents();
  const { selected, selectEvent } = useEventRoute(events);
  const [panelCollapsed, setPanelCollapsed] = useState(
    () => localStorage.getItem("boatPanelCollapsed") === "true"
  );
  const togglePanel = useCallback(() => {
    setPanelCollapsed((v) => {
      localStorage.setItem("boatPanelCollapsed", String(!v));
      return !v;
    });
  }, []);
  const [controlsOpen, setControlsOpen] = useState(
    () => localStorage.getItem("controlsOpen") !== "false"
  );
  const toggleControls = useCallback(() => {
    setControlsOpen((v) => {
      localStorage.setItem("controlsOpen", String(!v));
      return !v;
    });
  }, []);

  return (
    <div className="app-container">
      <header>
        <button
          className="header__panel-toggle"
          onClick={togglePanel}
          title={panelCollapsed ? "Show vessels" : "Hide vessels"}
        >
          <Sailboat size={18} />
        </button>
        <div className="header__title">
          <h1>SeeSea <sup style={{ fontSize: "0.4em" }}>2.0</sup></h1>
          {events && selected && (
            <>
              <span className="header__separator">·</span>
              <EventPicker events={events} selected={selected} onSelect={selectEvent} />
            </>
          )}
        </div>
        <button
          className="header__controls-toggle"
          onClick={toggleControls}
          title={controlsOpen ? "Hide controls" : "Show controls"}
        >
          <SlidersHorizontal size={18} />
        </button>
      </header>
      <main>
        {selected ? (
          <EventScope
            key={selected.slug}
            event={selected}
            panelCollapsed={panelCollapsed}
            onTogglePanel={togglePanel}
            controlsOpen={controlsOpen}
            onToggleControls={toggleControls}
          />
        ) : (
          <div className={eventsError ? "error" : "loading"}>
            {eventsError
              ? `Failed to load events: ${eventsError}`
              : events
                ? "No events configured"
                : "Loading events..."}
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
```

- [ ] **Step 8: Header styles in `src/App.css`**

Replace the `header h1 { … }` block with:

```css
header h1 {
  font-size: 1.1rem;
  line-height: 1;
  white-space: nowrap;
}

.header__title {
  grid-column: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  min-width: 0;
}

.header__separator {
  color: var(--panel-text-muted);
}

.event-picker {
  min-width: 0;
  max-width: 60vw;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.9rem;
  color: var(--panel-text);
  background: transparent;
  border: none;
  outline: none;
}

select.event-picker {
  cursor: pointer;
}

select.event-picker option {
  color: var(--panel-text);
  background: var(--panel-bg-solid);
}
```

- [ ] **Step 9: Type-check and lint against baseline**

Run: `npx tsc -b 2>&1 | grep "error TS"` → exactly the 5 baseline errors (`LiveMap.tsx` `onToggleControls`, three unused `mapboxgl`, `vite.config.ts` `process`).
Run: `npx eslint src 2>&1 | grep -c " error "` → `4`.
Run: `grep -rn "VITE_EVENT_SLUG" src` → no output.

- [ ] **Step 10: Commit**

```bash
git add src
git commit -m "Add event picker and /e/<slug> routing

The client loads /api/events, shows the event from the URL (falling
back to the first running or first listed event) and switches events
from a header picker or browser history. Everything event-specific
renders inside EventScope keyed by slug, and highlighted boats are
saved per event.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Per-event leg, map center, end-to-end verification, docs

**Files:**
- Modify: `src/hooks/useMapControls.ts`, `src/pages/LivePage.tsx`, `src/components/LiveMap.tsx`, `README.md`
- Create (untracked, `.context/`): `.context/me4.cjs`

**Interfaces:**
- Consumes: `useEventConfig()` returning `slug` and `center` (Task 3); routes/picker (Task 3); `/api/events` (Task 1).
- Produces: per-event `selectedLegId:<slug>` key; map initial center from the event.

- [ ] **Step 1: Per-event selected leg**

In `src/hooks/useMapControls.ts` add the import:

```ts
import { useEventConfig } from "./useEventConfig";
```

At the top of `useMapControls()` add:

```ts
  const { slug } = useEventConfig();
  const legKey = `selectedLegId:${slug}`;
```

Replace `localStorage.getItem("selectedLegId")` with `localStorage.getItem(legKey)`, `localStorage.setItem("selectedLegId", String(selectedLegId))` with `localStorage.setItem(legKey, String(selectedLegId))`, `localStorage.removeItem("selectedLegId")` with `localStorage.removeItem(legKey)`, and change that effect's dependency array from `[selectedLegId]` to `[selectedLegId, legKey]`.

In `src/pages/LivePage.tsx`, change `const { eventId, crews, legs } = useEventConfig();` to:

```ts
  const { eventId, crews, legs, slug } = useEventConfig();
  const legKey = `selectedLegId:${slug}`;
```

Replace both `localStorage.getItem("selectedLegId")` with `localStorage.getItem(legKey)`, and change the dependency arrays of the `selectedLegId` memo and the `selectedLegChanged` effect from `[]` to `[legKey]`.

- [ ] **Step 2: Map opens at the event center**

In `src/components/LiveMap.tsx` change `const { crews, highlightedCrews } = useEventConfig();` to:

```ts
  const { crews, highlightedCrews, center } = useEventConfig();
```

and in the `new mapboxgl.Map({ … })` options replace `center: DEFAULT_CENTER,` with:

```ts
      center: center ?? DEFAULT_CENTER,
```

- [ ] **Step 3: Type-check and lint**

Run: `npx tsc -b 2>&1 | grep -c "error TS"` → `5`. Run: `npx eslint src 2>&1 | grep -c " error "` → `4`. Run: `grep -rn '"selectedLegId"' src` → no output.

- [ ] **Step 4: End-to-end browser checks (Review Focus 2–4)**

Create `.context/me4.cjs`:

```js
const { chromium } = require("playwright");
const BASE = "http://localhost:3100";
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.PW_EXE });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => { if (!/WebSocket/.test(e.message)) errors.push(e.message); });
  const out = {};

  // `/` lands on the default event without adding a history entry
  await page.goto(BASE + "/");
  await page.waitForSelector("select.event-picker");
  out.rootUrl = new URL(page.url()).pathname;
  out.historyLength = await page.evaluate(() => history.length);
  out.options = await page.locator("select.event-picker option").allTextContents();
  await page.waitForTimeout(6000);
  await page.screenshot({ path: ".context/me-vr.png" });

  // Highlights for vr-2026: seeded, then cleared completely
  out.vrSeeded = await page.evaluate(() => JSON.parse(localStorage.getItem("seesea-highlighted-crews:vr-2026") || "null"));
  await page.evaluate(() => localStorage.setItem("seesea-highlighted-crews:vr-2026", "[]"));

  // Switch to Cany (Baltic) via the picker
  await page.selectOption("select.event-picker", "cany-offshore-cup-2026");
  await page.waitForTimeout(6000);
  out.canyUrl = new URL(page.url()).pathname;
  await page.screenshot({ path: ".context/me-cany.png" });
  out.canySeeded = await page.evaluate(() => JSON.parse(localStorage.getItem("seesea-highlighted-crews:cany-offshore-cup-2026") || "null"));

  // Back → vr-2026, forward → cany
  await page.goBack();
  await page.waitForTimeout(3000);
  out.backUrl = new URL(page.url()).pathname;
  out.backSelect = await page.inputValue("select.event-picker");
  out.vrAfterClear = await page.evaluate(() => localStorage.getItem("seesea-highlighted-crews:vr-2026"));
  await page.goForward();
  await page.waitForTimeout(3000);
  out.forwardSelect = await page.inputValue("select.event-picker");

  // Unlisted slug falls back to the default
  await page.goto(BASE + "/e/vr-2024");
  await page.waitForSelector("select.event-picker");
  out.unlistedUrl = new URL(page.url()).pathname;

  out.errors = errors;
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
})();
```

Start the stack and run it:

```bash
(env PORT=3101 EVENTS=vr-2026,seawolf-cup-36,cany-offshore-cup-2026 CACHE_DB_PATH=.context/me4.db server/node_modules/.bin/tsx server/src/index.ts > .context/me4s.log 2>&1 &)
(env API_TARGET=http://localhost:3101 npx vite --port 3100 > .context/me4v.log 2>&1 &); sleep 6
timeout 170 npm exec --yes --package=playwright@1.56 -- sh -c 'PW_EXE=$HOME/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell NODE_PATH="$(dirname "$(dirname "$(command -v playwright)")")" node .context/me4.cjs'
```

Expected JSON:
- `rootUrl: "/e/vr-2026"` (nothing is running on 2026-10-04, so the first listed), `historyLength: 1`
- `options: ["VR 2026", "Seawolf Cup 36" (exact upstream name), "<Cany name>"]`
- `vrSeeded`: non-empty array of ids
- `canyUrl: "/e/cany-offshore-cup-2026"`, `canySeeded`: an array (may be empty if no default boat names sail there)
- `backUrl: "/e/vr-2026"`, `backSelect: "vr-2026"`, `vrAfterClear: "[]"` (not re-seeded)
- `forwardSelect: "cany-offshore-cup-2026"`
- `unlistedUrl: "/e/vr-2026"`
- `errors: []`

Open `.context/me-vr.png` and `.context/me-cany.png` (Read tool): header shows `SeeSea 2.0 · VR 2026 ▾`; the Cany screenshot shows the map centred on the German Baltic coast (Kühlungsborn), not Croatia.

Stop the stack: `lsof -ti tcp:3101 | xargs kill; lsof -ti tcp:3100 | xargs kill`.

- [ ] **Step 5: Replay check**

```bash
(env PORT=3101 REPLAY=vr-2026 REPLAY_SPEED=10 server/node_modules/.bin/tsx server/src/index.ts > .context/me4r.log 2>&1 &)
(env API_TARGET=http://localhost:3101 npx vite --port 3100 > .context/me4v.log 2>&1 &); sleep 6
timeout 170 npm exec --yes --package=playwright@1.56 -- sh -c 'PW_EXE=$HOME/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell NODE_PATH="$(dirname "$(dirname "$(command -v playwright)")")" node .context/shot.cjs http://localhost:3100 .context/me-replay.png 15000'
lsof -ti tcp:3101 | xargs kill; lsof -ti tcp:3100 | xargs kill
```
Expected: `badge: REPLAY · vr-2026 · ×10 · …`, `errors` only the Vite WebSocket one. Open `.context/me-replay.png`: header shows `SeeSea 2.0 · ● VR 2026` as plain text (no dropdown), boats near Dubrovnik, wind overlay visible.

- [ ] **Step 6: README**

In `README.md`, in the "Dev data & replay" section, after the paragraph starting "The race clock starts at", add:

```markdown
In replay the event list is just the replayed event.
```

and add a new section before "## Dev data & replay":

```markdown
## Events

The API server offers the events listed in `EVENTS` (comma-separated SeeSea slugs, e.g. `EVENTS=seawolf-cup-36,palagruza-cup-2026,vr-2026`). The app opens `/e/<slug>`; `/` goes to the first running event, or the first listed one. Users switch events from the header picker. Highlighted boats and the selected leg are remembered per event.
```

- [ ] **Step 7: Final checks and commit**

Run: `server/node_modules/.bin/tsc -p server/tsconfig.json --noEmit && npx eslint server/src && echo server-clean` → `server-clean`.
Run: `npx tsc -b 2>&1 | grep -c "error TS"` → `5`; `npm run lint 2>&1 | grep -c " error "` → `4`.

```bash
git add src README.md
git commit -m "Remember the selected leg per event and center the map on the event

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```
