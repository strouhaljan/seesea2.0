# Multi-Event Support — Design

Date: 2026-10-04
Status: Approved in conversation, pending written-spec review

## Goal

Let users pick between several SeeSea events instead of the single build-time `VITE_EVENT_SLUG`. Step 2 of three (dev data ✅ → multi-event → performance).

Success means: the server serves a configured list of events; the client shows the event in the URL (`/e/<slug>`) and in a header picker; switching events gives a clean map, boat list and per-event saved state; the upcoming Palagruža Cup (2026-10-17) gets wind along its whole course.

## Context

- Single-event coupling today: `VITE_EVENT_SLUG` (client), `EVENT_SLUG` (server cache warming), hardcoded `DEFAULT_CENTER` = Murter (`src/utils/mapConfig.ts`), global localStorage keys `seesea-highlighted-crews` and `selectedLegId`.
- Already event-aware: every server route and client hook takes `eventId`; server and client history caches key on `eventId`.
- Upstream event config (`/cc_event/<slug>/`) has `name`, `event_start`, `event_end`, `default_lat`, `default_lng`.
- 30 of 32 upstream events are in the Adriatic; wind is fetched from Open-Meteo for fixed rectangles (`server/src/upstream/regions.ts`). The Palagruža course (Murter → 42.39 N 16.25 E) falls between the existing rectangles. The Baltic Cany Offshore Cup is outside all of them.
- SPA fallback for `/e/<slug>` already exists: nginx `try_files … /index.html`, PWA `navigateFallback`, Vite dev server.

## Decisions

| Topic | Decision |
|---|---|
| Event availability | Server env `EVENTS` (comma-separated slugs), falling back to `EVENT_SLUG`; replay → just the replay slug |
| Selection UI | Both: URL `/e/<slug>` and a header picker |
| Default event | First event in the list that is running (by `clock.now()` and event dates), else the first event |
| Unlisted slug | Server 404; client falls back to the default event |
| Replay | One event per replay (`REPLAY=<slug>` unchanged) |
| Wind | Keep fixed rectangles; add a fourth covering the Palagruža gap; no per-event wind areas; events outside coverage show no overlay |
| Per-event state | Highlighted crews and selected leg saved per event; other settings stay global |
| Routing | `history.pushState`/`popstate`, no router library |

## Design

### 1. Server

**Event list** — `server/src/events.ts`:
- `EVENT_SLUGS: string[]` = `clock.replay ? [clock.replay.slug] : (process.env.EVENTS ?? process.env.EVENT_SLUG ?? "")` split on commas, trimmed, empties dropped, order kept.
- `isListedEvent(slug)`.
- `getEventConfig(slug)` — shared 5-minute cache of upstream event config (moved from `routes/event.ts`), returning `{ eventId, name, start, end, center: [lng, lat], crews, legs }`.

**`GET /api/events`** — new route, events in `EVENT_SLUGS` order:
```json
[{ "slug": "seawolf-cup-36", "name": "Seawolf Cup 36", "start": "2026-10-10T12:00:00+02:00",
   "end": "2026-10-17T23:59:59+02:00", "running": false, "center": [15.59988, 43.828721] }]
```
- `running` = `start ≤ clock.now() ≤ end`.
- An event whose upstream config fails is omitted (logged), so one broken slug doesn't break the picker.

**`GET /api/event/:slug`** — unlisted slug → `404 {"error": "Event not available"}`; response gains `name` and `center`.

**Cache warming** (`server/src/index.ts`) — for each listed event, warm history from the start of its currently running leg (by `clock.now()`); events without a running leg are skipped. Runs at startup and every 10 minutes as today.

**Wind** — add region `{ name: "palagruza", minLat: 42.3, maxLat: 43.1, minLng: 15.4, maxLng: 16.5, latSteps: 8, lngSteps: 12 }` to `REGIONS`. The committed vr-2026 wind fixtures are re-recorded so replay has this region.

**Config plumbing** — `.conductor/settings.toml` and `docker-compose.yml` pass `EVENTS` (defaulting to `vr-2026`) instead of `EVENT_SLUG`; `.env.example` documents `EVENTS` and drops `VITE_EVENT_SLUG`.

### 2. Client

**Routing** — `src/utils/route.ts`:
- `getEventSlugFromPath(): string | null` parses `/e/<slug>`.
- `eventPath(slug)` → `/e/<slug>`.
- `App` loads `/api/events` once. If the path slug is missing or not in the list, it picks the default event and `history.replaceState`s to its path. Picker changes `pushState`; a `popstate` listener updates the selected slug.
- While `/api/events` loads, the existing loading state is shown; if it fails or is empty, an error message is shown.

**Picker** — header title becomes `SeeSea 2.0 · <event name ▾>`, a native `<select>` (styled like the MapControls leg select). Running events get a `●` prefix. With one event the name is plain text.

**Event scope** — new `EventScope` component rendered with `key={slug}` owns everything event-specific: event config loading (`useEventConfigLoader(slug)`), highlighted crews + default seeding, `EventConfigContext`, and `LivePage` (incl. the map). Switching events remounts it. App-level state (panel collapsed, controls open, theme, zoom, trail, wind toggles) stays in `App`.

**Per-event storage**:
- Highlighted crews: `seesea-highlighted-crews:<slug>`.
- Selected leg: `selectedLegId:<slug>` (both `useMapControls` and `LivePage` read/write the per-event key).
- `HIGHLIGHTED_BOATS` seeding runs once per event (when its key doesn't exist yet). `OUR_BOAT` stays global.
- Legacy global keys are ignored (highlights are re-seeded from defaults).

**Map** — `LiveMap` initial `center` comes from the event's `center`, falling back to `DEFAULT_CENTER`.

**Removed** — `VITE_EVENT_SLUG` usage and the replay-slug override in `useEventConfig`.

## Out of scope

- Per-event wind areas, wind for events outside the Adriatic rectangles.
- Replaying several recorded events at once.
- Fetching the event list from upstream automatically.
- Automated tests (still deferred).
- Performance work (step 3).

## Verification

1. Server `tsc` + `eslint` clean; client `tsc`/lint no errors beyond the baseline (5 / 4).
2. Server (live, `EVENTS=vr-2026,seawolf-cup-36,cany-offshore-cup-2026`): `/api/events` returns the three in order with names, centers, `running`; `/api/event/vr-2024` → 404; `/api/wind/ecmwf` returns 4 regions.
3. Browser (live, same `EVENTS`), with screenshots: picker lists the events; switching to Cany re-centres the map on the Baltic; highlights differ per event; back/forward switches events; `/` redirects to the default event; `/e/vr-2024` falls back to the default.
4. Replay (`REPLAY=vr-2026`): picker shows just VR 2026 as plain text; boats, tails and wind (4 regions) work offline.
