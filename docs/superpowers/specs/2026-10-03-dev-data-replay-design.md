# Dev Data & Simulated Live Replay — Design

Date: 2026-10-03
Status: Approved in conversation, pending written-spec review

## Goal

Give SeeSea 2.0 realistic, offline-capable dev data so that development, profiling and the upcoming multi-event work don't depend on a race being live. This is step 1 of three (dev data → multi-event support → performance).

Success means: with `REPLAY=vr-2026` set, the app behaves as if Leg 2 of VR 2026 were happening now — boats move, tails grow, wind overlay shows the real historical wind, the history slider advances — with zero requests to `app.seesea.cz` or `open-meteo.com`.

## Context

- Every upstream call is a hardcoded `fetch` inside a server route (`server/src/routes/*`, `server/src/index.ts`).
- For finished events upstream returns empty live data (`{"objects": {}}`) and `null` tails; only `data2` history survives. Plain record/replay of responses would therefore leave the live view empty.
- Both server and client use `Date.now()` as "race time" in several places (active-leg detection, current-hour chunk handling, slider end, tail cutoff, wind forecast window).
- Open-Meteo's historical-forecast API serves both models we use (`italia_meteo_arpae_icon_2i`, `ecmwf_ifs025`) for past dates.
- Sizes measured for VR 2026: one hour of slimmed `data2` ≈ 0.8 MB JSON / 130 KB gzipped (42 vessels, ~5k points at 30 s). Leg 2 is 14.5 h.

## Decisions

| Topic | Decision |
|---|---|
| Purpose | Simulated live race driven by a virtual clock (not static replay, no test framework yet) |
| Fixture storage | Committed, gzipped; only `vr-2026` (Leg 2) versioned, other recordings gitignored |
| Sim control | Env vars at server start + UI badge; no runtime control panel |
| Architecture | Upstream adapter inside the existing server (`HttpUpstream` / `ReplayUpstream`), not a separate mock server or client-side mocking |
| Clock end | Clamp at end of last recorded leg; no looping |
| Extra fix | Client `ChunkCache` must not permanently cache the current (still-filling) hour |

## Design

### 1. Upstream adapter

New `server/src/upstream/` module exposing one interface used by all routes, the cache warmer and the recorder:

```ts
interface Upstream {
  getEvent(slug: string): Promise<RawEvent>;                 // /cc_event/<slug>/
  getLive(eventId: string): Promise<RawLive>;                // /cc_event/<id>/data/live
  getTails(eventId: string, legId: string): Promise<RawTails>; // /cc_event/<id>/data/live/<leg>/tails
  getLeg(eventId: string, legId: string): Promise<unknown>;  // /cc_event/<id>/leg/<leg>/
  getDataHour(eventId: string, hourStart: number): Promise<Record<string, SlimPoint[]>>; // data2, slimmed
  getWind(model: WindModel, region: Region): Promise<unknown>; // Open-Meteo, 4 hours from current hour
}
```

- `HttpUpstream` holds today's fetch logic. Base URLs come from `SEESEA_API_URL` (default `https://app.seesea.cz/api`) and `OPEN_METEO_URL` (default `https://api.open-meteo.com/v1`).
- Slimming of `data2` points (`slim()` in `data2.ts`) moves into `HttpUpstream.getDataHour`, so both live caching and the recorder store the same shape.
- Routes keep their caching, stripping and merging logic; they only swap `fetch(url)` for an `upstream.*` call. Upstream HTTP errors surface as a typed error carrying the status so routes can keep returning the same status codes.
- The wind regions (`REGIONS`) move from `wind.ts` into a shared module used by the route and the recorder.
- `upstream` is a singleton chosen at startup: `ReplayUpstream` if `REPLAY` is set, else `HttpUpstream`.

### 2. Fixture format

`server/fixtures/<slug>/`:

```
manifest.json               {slug, eventId, legIds, recordedAt}
event.json                  raw /cc_event/<slug>/ response
legs/<legId>.json           raw leg response
data2/<hourStart>.json.gz   {vesselId: SlimPoint[]} for one hour
wind/<model>.json.gz        per-region raw Open-Meteo hourly response covering the recorded legs + 4 h
```

`.gitignore` adds `server/fixtures/*` and `!server/fixtures/vr-2026/`. The committed vr-2026 fixture contains Leg 2 (id 20151425) only, ≈ 2 MB.

### 3. Recorder

`server/src/scripts/record.ts` (inside `src` so it is type-checked), run via `npm --prefix server run record -- <slug> [--legs <id,id>]`.

- Uses `HttpUpstream` directly.
- Default legs: all with `active === 1`.
- History: every hour from `floorHour(leg.start)` to `floorHour(leg.end)`, fetched in batches of 4 (as `warmCache` does).
- Wind: Open-Meteo historical-forecast endpoint (`/v1/forecast` on `historical-forecast-api.open-meteo.com`) with `start_date`/`end_date` spanning the recorded legs + 4 h, same grid points and hourly variables as the live request, for both models.
- Resumable: existing `data2/<hour>.json.gz` files are skipped.
- On per-hour failure: log, continue, print the missing hours at the end and exit non-zero.
- Writes `manifest.json` last.

### 4. Server clock

`server/src/clock.ts`:

- Env: `REPLAY=<slug>`, `REPLAY_START=<ISO>` (default: first recorded leg start + 30 min), `REPLAY_SPEED=<n>` (default 1).
- `now()` → ms. Replay: `min(REPLAY_START + (Date.now() − bootTime) × speed, lastRecordedLegEnd)`. Otherwise `Date.now()`.
- Rule: `clock.now()` for race time; `Date.now()` for cache ages (TTL / `fetchedAt`).
- Call sites switched to `clock.now()`: `isCurrentHour` in `data2.ts` `fetchChunk`, `nowSeconds` in `warmCache`, active-leg detection in `tryWarmCache`.
- `GET /api/clock` → `{now, speed, end, replay}` (`end` is the clamp time in ms or `null`; `replay` is the slug or `null`).
- History chunk completeness (fixes an existing bug where a prefetched future hour was cached and persisted empty forever): a server chunk is *complete* only if `hourStart + 3600 ≤ clock.nowSeconds()` when fetched. Complete chunks are served from cache indefinitely and persisted to SQLite; others are refetched after the 60 s TTL and never persisted. On startup, SQLite rows with `fetched_at < (hour_start + 3600) × 1000` are ignored.

### 5. ReplayUpstream

Reads fixtures for the `REPLAY` slug (gz files decompressed and memoised on first read) and never returns data later than `clock.now()`:

| Method | Behaviour |
|---|---|
| `getEvent(slug)` | `event.json` with `cc_event_leg` filtered to `manifest.legIds`; other slugs → 404 |
| `getDataHour(id, h)` | Hour file; if `h` is the current sim hour, only points with `time ≤ now`; future hours → `{}` |
| `getLive(id)` | Per vessel, latest point with `time ≤ now` (searching back through earlier hours of the leg); `{updateInterval: 10, objects}` |
| `getTails(id, leg)` | Points from `max(legStart, now − 10800 s)` to `now` as `[t, lng, lat]`; `{beginDate: leg.start, trackLengthMax: 10800, tails}` |
| `getLeg(id, leg)` | `legs/<leg>.json` |
| `getWind(model, region)` | Recorded hourly series sliced to the 4 hours starting at `floorHour(now)`, in the same shape as a live `forecast_hours=4` response |

The tails route's existing wind-speed enrichment (`getWindSpeeds`) runs unchanged on top.

Wind route cache key becomes `model + floorHour(clock.now())` so a sim hour change (6 wall-minutes at ×10) fetches the next window.

Persistence: in replay the SQLite cache uses `:memory:`; `purgeOldChunks` is skipped. Startup log: `REPLAY <slug> (legs <ids>) from <start> at ×<speed>`.

### 6. Client

- `src/utils/clock.ts`: `initClock()` fetches `/api/clock` once; `now()` returns `min(serverNow + (performance.now() − fetchedAt) × speed, end)`, falling back to `Date.now()` if the request fails or replay is off. `getReplay()` exposes `{slug, speed} | null`.
- `main.tsx` awaits `initClock()` before the first render.
- Switched to `clock.now()`: `LivePage` auto-leg detection and `nowTime`; `useTailLayer` trail cutoff; `windGrid` client cache (keyed by sim hour instead of a 30 min wall TTL).
- Unchanged (wall clock): `usePolling` backoff, `formatDataAge`, `lastUpdated`.
- `useEventConfigLoader` uses the replay slug when present, else `VITE_EVENT_SLUG`.
- Replay badge next to `.live-dot`: `REPLAY · <slug> · ×<speed> · HH:MM`, ticking each second, only rendered in replay.
- `ChunkCache` fix: a chunk whose hour has not fully elapsed at `clock.now()` (current or future hour) is cached for 30 s only, then re-fetched; complete hours are cached indefinitely (fixes the same staleness in production).

### 7. Dev workflow & docs

- `.env.example`: commented `REPLAY=vr-2026`, `REPLAY_SPEED=10`, `REPLAY_START=`, `SEESEA_API_URL`, `OPEN_METEO_URL`.
- Conductor run script needs no change (it sources `.env` and the server inherits it).
- `README.md`: "Dev data & replay" section — enabling replay, recording another event.

## Out of scope

- Automated tests / Vitest (later).
- Runtime replay controls (pause, seek, speed change without restart).
- Multi-event selection, event list endpoint, per-event wind regions, per-event highlighted boats (step 2).
- Performance work (step 3).

## Verification

1. `tsc` + `eslint` pass for client and server.
2. Record vr-2026 Leg 2; committed fixture ≈ 2 MB.
3. Run with `REPLAY=vr-2026 REPLAY_SPEED=10`: boats move, tails grow, wind overlay shows, slider end advances, badge visible, history scrub to the current hour shows fresh points.
4. With upstream hosts unreachable (e.g. `SEESEA_API_URL`/`OPEN_METEO_URL` pointed at an invalid host), replay still works fully.
5. Without `REPLAY`, the app behaves as before against live upstream.
