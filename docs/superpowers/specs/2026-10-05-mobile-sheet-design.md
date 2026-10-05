# Phone Layout: Boat Sheet and Boat Card — Design

Date: 2026-10-05
Status: Approved in conversation (visual companion: layout A, boat card A, phones only), pending written-spec review

## Goal

On phones the map must stay visible. Today, a first visit opens the boat list (~65% width) and the controls panel at the same time, overlapping each other and covering the map; tapping a boat opens the whole list over the boat you tapped; history, list and controls can all be open at once.

Success means, on screens narrower than 768 px:
- first visit shows the map with only a slim bar at the bottom;
- the boat list lives in a draggable bottom sheet;
- tapping a boat shows a compact boat card in that sheet while the boat stays visible;
- the sheet, the controls panel and the history panel never cover each other.

Desktop keeps its current layout.

## Context

- `BoatPanel.tsx` (313 lines) is the side panel: search, sort (number / position / wind), star toggles, cards with SOG, DTF and wind; it also computes distance to finish (`dtfMap`) and position (`positionMap`) from the `finish` leg marker, and supports an edge-swipe to open.
- `App.tsx` owns `panelCollapsed` and `controlsOpen` (header buttons ⛵ and ⚙, persisted in localStorage); `MapControls` renders the controls card bottom-right.
- `HistorySlider.tsx` keeps its own `expanded` state (tab at the top centre).
- `LivePage.tsx`: `handleBoatClick` sets the active boat, starts following it and opens the panel; `handleFocusBoat` (list card tap) follows and flies to the boat; a floating "Following … — tap to stop" pill sits bottom-left.
- `/api/live` strips each vessel to `coords, hdg, cog, sog, twa, tws` — no `time`.

## Decisions

| Topic | Decision |
|---|---|
| Layout on phones | Boat list as a bottom sheet (bar / half / full); controls and history as separate panels, one open at a time |
| Tapping a boat (phones) | Boat card inside the sheet, not a map popup |
| Scope | Phones only: `max-width: 767px`; desktop unchanged except the Following pill |
| Tap behaviour (phones) | Tap selects and centres; following is an explicit button. Desktop keeps tap = follow |

## Design

### 1. Phone detection

`useIsPhone()` hook — `matchMedia("(max-width: 767px)")`, updates on change (rotation, resize).

### 2. Bottom sheet (`BottomSheet` component)

- Fixed to the bottom of the map area, full width, rounded top corners, opaque panel background.
- Three snap heights: **bar** = 76 px (handle + the search/sort row — a boat card is ~90 px tall, too tall for a slim bar), **half** = 45% of the viewport, **full** = 85% (header stays visible).
- Drag the handle with pointer events (touch and mouse) and snap to the nearest height on release (with a velocity flick to the next height); tapping the handle toggles bar ↔ half. No external library.
- Content scrolls inside the sheet at half/full; at bar only the first row shows.
- First visit: **bar**. Last height is remembered in localStorage (`boatSheetSnap`).
- The map gets bottom padding equal to the sheet's visible height (Mapbox `setPadding`), so centring and following keep the boat above the sheet.

### 3. Boat list in the sheet

- The list part of `BoatPanel` (search, sort toggle, cards, star toggles) is split into a `BoatList` component used by both the desktop side panel and the phone sheet.
- DTF and position calculation move into a shared `useFleetStats(crews, vesselsData, legMarkers)` hook returning `{ dtf: Map<number, number>, position: Map<number, number> }`.
- On phones cards are full sheet width, so values no longer wrap.
- Tapping a card on a phone opens that boat's card (see 4) and centres the boat.
- The edge-swipe-to-open gesture is disabled on phones.

### 4. Boat card (`BoatCard` component, phones)

- Opened by tapping a boat marker or a list card. The sheet switches from list to card and rises to at least **half**.
- Shows: sail number, name, crew description; speed (SOG), distance to finish, position by DTF ("6th"), wind speed (TWS), course (COG), true wind angle (TWA), age of the last fix ("2 min ago").
- Buttons: **Follow / Stop following** (toggles `followedBoatId`) and **★ Highlight** (toggles highlight).
- ✕ (or dragging down to bar) returns to the list. Tapping another boat swaps the card.
- Values update with live data; in history mode they show the replayed values (from `displayData`).
- On phones the floating Following pill is not shown — the card's button carries that state.
- On phones, tapping a marker selects it and centres the map on it (no auto-follow).

### 5. One panel at a time (phones)

`LivePage` tracks `phonePanel: "sheet" | "controls" | "history"`:
- Opening controls (header ⚙) or history (top tab) collapses the sheet to **bar** and closes the other one.
- Expanding the sheet (drag/tap) closes controls and history.
- Tapping the map closes the controls panel.
- `HistorySlider` becomes controlled (`expanded` / `onExpandedChange`), owned by `LivePage` on all screen sizes (its only user).
- The controls card, live dot, wind legend and Mapbox attribution sit above the sheet: `LivePage` publishes the sheet's height as the CSS variable `--sheet-height`.
- The header ⛵ button on phones toggles the sheet bar ↔ half instead of the side panel.

### 6. Server

`/api/live` adds `time` to `ALLOWED_FIELDS` so the card can show the fix age.

### 7. Desktop

Unchanged layout. The Following pill is offset so it no longer covers the bottom of the side panel.

## Out of scope

- Map label declutter, controls copy/scale fixes, legend (separate items C and D).
- Changes to the desktop side panel layout.
- Tablet-specific layout.

## Verification

Scripted Playwright screenshots on the VR 2026 replay (×1, mid-race), phone 390×844 and desktop 1440×900:
1. Phone first visit: map visible, sheet at bar, no controls panel.
2. Sheet dragged bar → half → full and back; height remembered after reload.
3. Tap a boat marker: card at half, boat visible above the sheet; Follow → map follows, button shows "Stop following"; ★ toggles highlight; ✕ returns to the list.
4. Open controls → sheet collapses to bar; open history → controls close; expand sheet → history closes; tap map → controls close.
5. History mode: card values follow the replay.
6. Desktop: same as before (side panel, controls, tap = follow), Following pill no longer over the list.
7. `npx tsc -b`, `npm run lint` (0 errors), `npm run build`, server `tsc` + `eslint` clean.
