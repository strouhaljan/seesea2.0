# Phone Boat Sheet and Boat Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On phones (< 768 px) show the boat list in a draggable bottom sheet, show a compact boat card when a boat is tapped, and never let the sheet, controls and history cover each other — desktop unchanged.

**Architecture:** A `useIsPhone()` hook switches `LivePage` between the existing desktop side panel and a new `BottomSheet` holding either the extracted `BoatList` or a new `BoatCard`. `App` owns the sheet height (persisted) and the controls flag; `LivePage` owns history-open and card state and enforces one-panel-at-a-time. The sheet's visible height is published as a CSS variable (`--sheet-height`) and as Mapbox map padding so overlays and centring stay above it.

**Tech Stack:** React 19 + TypeScript, Mapbox GL JS 3, plain CSS (`src/App.css`), Playwright (via `npm exec`) for scripted checks.

**Spec:** `docs/superpowers/specs/2026-10-05-mobile-sheet-design.md`

## Global Constraints

- Phone breakpoint, verbatim: `(max-width: 767px)`; everything phone-only is gated by `useIsPhone()` or that media query.
- Sheet heights: **bar** = 76 px (handle + search/sort row), **half** = 45% of `window.innerHeight`, **full** = 85%. First visit: bar. Persisted in localStorage key `boatSheetSnap`.
- Phones: controls panel closed on first visit (desktop default stays open). Tap on a boat = select + centre (no auto-follow); desktop keeps tap = follow.
- No new npm dependencies.
- Verification: no automated test framework (user's call). Gate per task = `npx tsc -b` (0 errors), `npm run lint` (0 errors, no new warnings vs. task BASE), `npm run build`, server `tsc --noEmit` + `eslint` clean, plus the task's Playwright script whose printed JSON must match its `Expected:`.
- Playwright runs: `npm exec --yes --package=playwright@1.56 -- sh -c 'CHROME_EXE="$HOME/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing" NODE_PATH="$(dirname "$(dirname "$(command -v playwright)")")" node <script>'`, launched with `chromium.launch({ executablePath: process.env.CHROME_EXE, args: ["--headless=new", "--use-angle=metal", "--enable-gpu"] })`.
- Test stack: replay server `(env PORT=3101 REPLAY=vr-2026 REPLAY_SPEED=1 REPLAY_START=2026-04-02T15:00:00+02:00 SEESEA_API_URL=http://127.0.0.1:9 OPEN_METEO_URL=http://127.0.0.1:9 server/node_modules/.bin/tsx server/src/index.ts > .context/ms-s.log 2>&1 &)` and `npx vite build && (env API_TARGET=http://localhost:3101 npx vite preview --port 3100 --strictPort > .context/ms-v.log 2>&1 &)`; stop with `lsof -ti tcp:3100 | xargs kill; lsof -ti tcp:3101 | xargs kill`.
- Commit style: sentence-case imperative subject, trailer `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## Review Focus

1. **Rotating the phone / resizing across 768 px** — layout switches cleanly between sheet and side panel without a stuck or invisible list. Pinned in Task 2, Step 7 (viewport resize check).
2. **Following a boat with the sheet at half height** — the followed boat stays visible above the sheet, not behind it (map padding). Pinned in Task 3, Step 6 (marker position vs. sheet top).
3. **Card for a boat with no data yet** (no live position) — card shows dashes, doesn't crash. Pinned in Task 3, Step 6 (code-reading check; the replay has data for every boat).
4. **Mapbox attribution/logo** stays visible above the sheet bar. Pinned in Task 2, Step 7.
5. **Desktop regression** — side panel, controls default, tap = follow, list click flies + follows. Pinned in Task 1, Step 6 and Task 3, Step 6.

---

## File Structure

- Create `src/hooks/useIsPhone.ts` — `useIsPhone()`, `isPhoneNow()`
- Create `src/hooks/useFleetStats.ts` — DTF + position per crew, `formatDistanceNm`
- Create `src/components/BoatList.tsx` — search, sort, cards, stars (extracted from `BoatPanel`)
- Modify `src/components/BoatPanel.tsx` — desktop side panel shell around `BoatList`
- Create `src/components/BottomSheet.tsx` — draggable sheet, snap heights
- Create `src/components/BoatCard.tsx` — phone boat card
- Modify `src/components/HistorySlider.tsx` — controlled `expanded`
- Modify `src/components/LiveMap.tsx` — handle gains `centerOn`, `setBottomPadding`
- Modify `src/pages/LivePage.tsx` — phone/desktop branches, panel coordination, card state
- Modify `src/components/EventScope.tsx`, `src/App.tsx` — sheet snap + controls plumbing
- Modify `src/App.css` — sheet, card, phone overrides
- Modify `server/src/routes/live.ts` — pass `time`

---

### Task 1: Shared pieces with desktop unchanged

**Files:**
- Create: `src/hooks/useIsPhone.ts`, `src/hooks/useFleetStats.ts`, `src/components/BoatList.tsx`
- Modify: `src/components/BoatPanel.tsx`, `src/pages/LivePage.tsx`, `server/src/routes/live.ts`, `src/App.css`

**Interfaces:**
- Produces:
  - `useIsPhone(): boolean`, `isPhoneNow(): boolean`, `PHONE_QUERY = "(max-width: 767px)"` — `src/hooks/useIsPhone.ts`
  - `interface FleetStats { dtf: Map<number, number>; position: Map<number, number>; hasFinish: boolean }`, `useFleetStats(crews: Crew[], vesselsData: Record<string, VesselDataPoint>, legMarkers: LegMarker[]): FleetStats`, `formatDistanceNm(nm: number): string` — `src/hooks/useFleetStats.ts`
  - `<BoatList crews vesselsData stats activeBoatId followedBoatId onSelect={(crewId: number) => void} />` — `src/components/BoatList.tsx`
  - `BoatPanel` props become `{ crews, vesselsData, stats, activeBoatId, followedBoatId, collapsed, onToggleCollapsed, onSelect }`
  - `/api/live` objects include `time`

- [ ] **Step 1: Create `src/hooks/useIsPhone.ts`**

```ts
import { useEffect, useState } from "react";

export const PHONE_QUERY = "(max-width: 767px)";

/** Current match, for one-off decisions (e.g. initial state). */
export function isPhoneNow(): boolean {
  return window.matchMedia(PHONE_QUERY).matches;
}

/** True on phone-sized screens; follows rotation and resizes. */
export function useIsPhone(): boolean {
  const [isPhone, setIsPhone] = useState(isPhoneNow);
  useEffect(() => {
    const mql = window.matchMedia(PHONE_QUERY);
    const onChange = () => setIsPhone(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return isPhone;
}
```

- [ ] **Step 2: Create `src/hooks/useFleetStats.ts`** (logic moved verbatim from `BoatPanel.tsx:100-127`)

```ts
import { useMemo } from "react";
import type { Crew } from "./useEventConfig";
import type { LegMarker } from "./useLegMarkers";
import type { VesselDataPoint } from "../types/tripData";
import { distanceNm } from "../utils/distance";

export interface FleetStats {
  /** Distance to the finish mark in nm, per crew id. */
  dtf: Map<number, number>;
  /** 1-based place by distance to finish, per crew id. */
  position: Map<number, number>;
  /** The leg has a finish mark. */
  hasFinish: boolean;
}

export function useFleetStats(
  crews: Crew[],
  vesselsData: Record<string, VesselDataPoint>,
  legMarkers: LegMarker[],
): FleetStats {
  const finishMark = useMemo(() => legMarkers.find((m) => m.marker_type === "finish"), [legMarkers]);

  const dtf = useMemo(() => {
    const map = new Map<number, number>();
    if (!finishMark) return map;
    const finishCoords: [number, number] = [finishMark.lon, finishMark.lat];
    for (const crew of crews) {
      const data = vesselsData[String(crew.id)];
      if (data?.coords) map.set(crew.id, distanceNm(data.coords, finishCoords));
    }
    return map;
  }, [crews, vesselsData, finishMark]);

  const position = useMemo(() => {
    const map = new Map<number, number>();
    [...dtf.entries()].sort((a, b) => a[1] - b[1]).forEach(([crewId], i) => map.set(crewId, i + 1));
    return map;
  }, [dtf]);

  return { dtf, position, hasFinish: finishMark != null };
}

export function formatDistanceNm(nm: number): string {
  return nm < 1 ? `${(nm * 1852).toFixed(0)} m` : `${nm.toFixed(1)} nm`;
}
```

- [ ] **Step 3: Create `src/components/BoatList.tsx`** (search, sort and cards moved from `BoatPanel.tsx:38-41,129-308`; card click now calls `onSelect`)

```tsx
import { useCallback, useEffect, useRef, useState } from "react";
import { VesselDataPoint } from "../types/tripData";
import { Crew, useEventConfig } from "../hooks/useEventConfig";
import { FleetStats, formatDistanceNm } from "../hooks/useFleetStats";
import { getColorBySpeed } from "../utils/wind";
import { OUR_BOAT } from "../config";

type SortMode = "number" | "position" | "wind";

interface BoatListProps {
  crews: Crew[];
  vesselsData: Record<string, VesselDataPoint>;
  stats: FleetStats;
  activeBoatId: number | null;
  followedBoatId: number | null;
  onSelect: (crewId: number) => void;
}

/** Search, sort and boat cards — shown in the desktop side panel and the phone sheet. */
const BoatList = ({ crews, vesselsData, stats, activeBoatId, followedBoatId, onSelect }: BoatListProps) => {
  const { highlightedCrews, toggleHighlight } = useEventConfig();
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>(
    () => (localStorage.getItem("boatPanelSort") as SortMode) || "number",
  );
  const activeCardRef = useRef<HTMLDivElement>(null);

  // Scroll active vessel into view
  useEffect(() => {
    if (activeBoatId != null && activeCardRef.current) {
      activeCardRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [activeBoatId]);

  const { dtf: dtfMap, position: positionMap } = stats;
  const canSortByPosition = stats.hasFinish && dtfMap.size > 0;

  const cycleSortMode = useCallback(() => {
    const sortModes: SortMode[] = canSortByPosition ? ["number", "position", "wind"] : ["number", "wind"];
    setSortMode((prev) => {
      const next = sortModes[(sortModes.indexOf(prev) + 1) % sortModes.length];
      localStorage.setItem("boatPanelSort", next);
      return next;
    });
  }, [canSortByPosition]);

  if (crews.length === 0) return null;

  // Sort: highlighted first, then by chosen sort mode
  const sortedCrews = [...crews].sort((a, b) => {
    const aHighlighted = highlightedCrews.has(a.id) ? 0 : 1;
    const bHighlighted = highlightedCrews.has(b.id) ? 0 : 1;
    if (aHighlighted !== bHighlighted) return aHighlighted - bHighlighted;

    const byNumber = () => (a.start_number ?? 0) - (b.start_number ?? 0);

    if (sortMode === "position" && canSortByPosition) {
      const aDtf = dtfMap.get(a.id);
      const bDtf = dtfMap.get(b.id);
      if (aDtf == null && bDtf == null) return byNumber();
      if (aDtf == null) return 1;
      if (bDtf == null) return -1;
      return aDtf - bDtf;
    }

    if (sortMode === "wind") {
      const aTws = vesselsData[String(a.id)]?.tws;
      const bTws = vesselsData[String(b.id)]?.tws;
      if (aTws == null && bTws == null) return byNumber();
      if (aTws == null) return 1;
      if (bTws == null) return -1;
      return bTws - aTws; // highest wind first
    }

    return byNumber();
  });

  const filteredCrews = search
    ? sortedCrews.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))
    : sortedCrews;

  const highlightedCount = filteredCrews.filter((c) => highlightedCrews.has(c.id)).length;

  return (
    <div className="boat-list">
      <div className="boat-panel__search-wrap">
        <div className="boat-panel__search-input-wrap">
          <input
            className="boat-panel__search"
            type="text"
            placeholder="Search vessels…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button className="boat-panel__search-clear" onClick={() => setSearch("")} title="Clear search">
              ×
            </button>
          )}
        </div>
        <button
          className="boat-panel__sort-toggle"
          onClick={cycleSortMode}
          title={
            sortMode === "number" ? "Sorted by sail number"
            : sortMode === "position" ? "Sorted by race position"
            : "Sorted by wind speed"
          }
        >
          {sortMode === "number" && (
            <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
              <text x="1" y="12" fontSize="11" fontWeight="700" fontFamily="system-ui">#</text>
            </svg>
          )}
          {sortMode === "position" && (
            <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
              <rect x="1" y="6" width="4" height="9" rx=".5" opacity=".7" />
              <rect x="6" y="2" width="4" height="13" rx=".5" />
              <rect x="11" y="9" width="4" height="6" rx=".5" opacity=".5" />
            </svg>
          )}
          {sortMode === "wind" && (
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M1 8h10c1.5 0 2.5-1 2.5-2.5S12.5 3 11 3c-1 0-1.8.8-1.8 1.8" />
              <path d="M1 12h7c1.2 0 2 .8 2 2s-.8 2-2 2c-.8 0-1.4-.6-1.4-1.4" />
            </svg>
          )}
        </button>
      </div>
      <div className="boat-panel__list">
        {filteredCrews.map((crew, i) => {
          const data = vesselsData[String(crew.id)];
          const isOurs = crew.name === OUR_BOAT;
          const isActive = crew.id === activeBoatId;
          const showDivider = highlightedCount > 0 && i === highlightedCount;
          const position = positionMap.get(crew.id);
          const dtf = dtfMap.get(crew.id);

          return (
            <div key={crew.id}>
              {showDivider && <div className="boat-panel__divider" />}
              <div
                ref={isActive ? activeCardRef : undefined}
                className={`boat-card ${isOurs ? "boat-card--ours" : ""} ${isActive ? "boat-card--active" : ""}`}
                style={{ borderLeftColor: crew.track_color }}
              >
                <div className="boat-card__body" onClick={() => onSelect(crew.id)}>
                  <div className="boat-card__header">
                    {position != null && <span className="boat-card__position">{position}</span>}
                    <span className="boat-card__dot" style={{ backgroundColor: crew.track_color }} />
                    <strong>{crew.name}</strong>
                    <span className="boat-card__number">#{crew.start_number}</span>
                    {crew.id === followedBoatId && <span className="boat-card__follow-badge">following</span>}
                  </div>
                  {crew.description && <div className="boat-card__desc">{crew.description}</div>}
                  {data ? (
                    <div className="boat-card__stats">
                      <span>{data.sog?.toFixed(1) ?? "?"} kn</span>
                      {dtf != null && <span className="boat-card__dtf">{formatDistanceNm(dtf)} DTF</span>}
                      {data.tws != null && (
                        <span style={{ color: getColorBySpeed(data.tws) }}>{data.tws.toFixed(1)} kn wind</span>
                      )}
                    </div>
                  ) : (
                    <div className="boat-card__stats boat-card__stats--empty">No data</div>
                  )}
                </div>
                <button
                  className={`boat-card__star ${highlightedCrews.has(crew.id) ? "boat-card__star--active" : ""}`}
                  onClick={() => toggleHighlight(crew.id)}
                  title={highlightedCrews.has(crew.id) ? "Remove highlight" : "Highlight"}
                >
                  {highlightedCrews.has(crew.id) ? "★" : "☆"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default BoatList;
```

- [ ] **Step 4: Reduce `src/components/BoatPanel.tsx` to the desktop shell**

```tsx
import { useCallback, useEffect, useRef } from "react";
import { VesselDataPoint } from "../types/tripData";
import { Crew } from "../hooks/useEventConfig";
import { FleetStats } from "../hooks/useFleetStats";
import BoatList from "./BoatList";

interface BoatPanelProps {
  crews: Crew[];
  vesselsData: Record<string, VesselDataPoint>;
  stats: FleetStats;
  activeBoatId: number | null;
  followedBoatId: number | null;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onSelect: (crewId: number) => void;
}

const SWIPE_THRESHOLD = 50;
const EDGE_ZONE = 30;

/** Desktop side panel around the boat list, with edge-swipe open/close. */
const BoatPanel = ({ collapsed, onToggleCollapsed, ...listProps }: BoatPanelProps) => {
  const touchRef = useRef<{ startX: number; startY: number; isEdge: boolean } | null>(null);

  // Edge swipe to open: listen on document
  const handleDocTouchStart = useCallback((e: TouchEvent) => {
    const touch = e.touches[0];
    if (touch.clientX <= EDGE_ZONE) {
      touchRef.current = { startX: touch.clientX, startY: touch.clientY, isEdge: true };
    }
  }, []);

  const handleDocTouchEnd = useCallback((e: TouchEvent) => {
    const ref = touchRef.current;
    if (!ref?.isEdge) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - ref.startX;
    const dy = Math.abs(touch.clientY - ref.startY);
    touchRef.current = null;
    if (dx > SWIPE_THRESHOLD && dx > dy && collapsed) onToggleCollapsed();
  }, [collapsed, onToggleCollapsed]);

  useEffect(() => {
    document.addEventListener("touchstart", handleDocTouchStart, { passive: true });
    document.addEventListener("touchend", handleDocTouchEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", handleDocTouchStart);
      document.removeEventListener("touchend", handleDocTouchEnd);
    };
  }, [handleDocTouchStart, handleDocTouchEnd]);

  // Swipe left on panel to close
  const handlePanelTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchRef.current = { startX: touch.clientX, startY: touch.clientY, isEdge: false };
  }, []);

  const handlePanelTouchEnd = useCallback((e: React.TouchEvent) => {
    const ref = touchRef.current;
    if (!ref || ref.isEdge) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - ref.startX;
    const dy = Math.abs(touch.clientY - ref.startY);
    touchRef.current = null;
    if (dx < -SWIPE_THRESHOLD && Math.abs(dx) > dy && !collapsed) onToggleCollapsed();
  }, [collapsed, onToggleCollapsed]);

  if (listProps.crews.length === 0) return null;

  return (
    <div
      className={`boat-panel ${collapsed ? "boat-panel--collapsed" : ""}`}
      onTouchStart={handlePanelTouchStart}
      onTouchEnd={handlePanelTouchEnd}
    >
      <BoatList {...listProps} />
    </div>
  );
};

export default BoatPanel;
```

- [ ] **Step 5: Wire `LivePage` (desktop behaviour unchanged), server `time`, CSS**

`src/pages/LivePage.tsx`:
- Add import: `import { useFleetStats } from "../hooks/useFleetStats";`
- After the `displayData` line add: `const stats = useFleetStats(crews, displayData, legMarkers);`
- Replace the `<BoatPanel … />` element with:

```tsx
        <BoatPanel
          crews={crews}
          vesselsData={displayData}
          stats={stats}
          activeBoatId={activeBoatId}
          followedBoatId={followedBoatId}
          collapsed={panelCollapsed}
          onToggleCollapsed={onTogglePanel}
          onSelect={(id) => {
            setActiveBoatId(id);
            handleFocusBoat(id);
          }}
        />
```

`server/src/routes/live.ts` — replace the `ALLOWED_FIELDS` line:

```ts
const ALLOWED_FIELDS = ["time", "coords", "hdg", "cog", "sog", "twa", "tws"] as const;
```

`src/App.css` — add after the `.boat-panel--collapsed { … }` block:

```css
.boat-list {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}
```

- [ ] **Step 6: Verify desktop is unchanged (Review Focus 5)**

Run: `npx tsc -b 2>&1 | grep -c "error TS"` → `0`; `npm run lint 2>&1 | grep -c " error "` → `0`; `npm run build` succeeds; `server/node_modules/.bin/tsc -p server/tsconfig.json --noEmit && npx eslint server/src` clean.

Start the test stack (Global Constraints). Create `.context/ms1.cjs`:

```js
const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_EXE, args: ["--headless=new", "--use-angle=metal", "--enable-gpu"] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto("http://localhost:3100/e/vr-2026");
  await page.waitForFunction(() => document.querySelectorAll(".vessel-marker").length >= 30, null, { timeout: 60000 });
  await page.waitForTimeout(3000);
  const before = await page.evaluate(() => ({
    panel: !!document.querySelector(".boat-panel:not(.boat-panel--collapsed)"),
    cards: document.querySelectorAll(".boat-panel .boat-card").length,
    dtfShown: document.querySelectorAll(".boat-card__dtf").length,
  }));
  await page.locator(".boat-panel .boat-card__body").nth(3).click();
  await page.waitForTimeout(1500);
  const after = await page.evaluate(() => ({
    following: !!document.querySelector(".boat-card__follow-badge"),
    pill: document.querySelector(".follow-indicator")?.textContent ?? null,
  }));
  const live = await (await fetch("http://localhost:3101/api/live/201619")).json();
  const first = Object.values(live.objects)[0];
  console.log(JSON.stringify({ ...before, ...after, liveHasTime: typeof first?.time === "number" }));
  await page.screenshot({ path: ".context/ms1-desktop.png" });
  await browser.close();
})();
```

Run it with the Playwright command from Global Constraints.
Expected: `{"panel":true,"cards":43,"dtfShown":<n > 0>,"following":true,"pill":"Following … — tap to stop","liveHasTime":true}`; screenshot looks like `.context/ux/desktop-4-boat-tapped.png`.

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useIsPhone.ts src/hooks/useFleetStats.ts src/components/BoatList.tsx src/components/BoatPanel.tsx src/pages/LivePage.tsx src/App.css server/src/routes/live.ts
git commit -m "Split the boat list out of the side panel

BoatList (search, sort, cards) and useFleetStats (distance to finish,
place) can now be reused by the phone layout; useIsPhone detects phone
screens. /api/live passes each boat's fix time. Desktop is unchanged.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Bottom sheet on phones, one panel at a time

**Files:**
- Create: `src/components/BottomSheet.tsx`
- Modify: `src/App.tsx`, `src/components/EventScope.tsx`, `src/pages/LivePage.tsx`, `src/components/HistorySlider.tsx`, `src/components/LiveMap.tsx`, `src/App.css`

**Interfaces:**
- Consumes: `useIsPhone`, `isPhoneNow` (Task 1), `BoatList` (Task 1), `useFleetStats` result `stats` in `LivePage` (Task 1).
- Produces:
  - `type SheetSnap = "bar" | "half" | "full"`, `sheetHeight(snap: SheetSnap, viewport?: number): number`, `<BottomSheet snap onSnapChange={(s: SheetSnap) => void}>{children}</BottomSheet>` — `src/components/BottomSheet.tsx`
  - `LiveMapHandle` gains `centerOn(coords: [number, number]): void` and `setBottomPadding(px: number): void`
  - `HistorySlider` props gain required `expanded: boolean`, `onExpandedChange: (open: boolean) => void`
  - `LivePage` / `EventScope` props gain `isPhone: boolean`, `sheetSnap: SheetSnap`, `onSheetSnapChange: (s: SheetSnap) => void`, `onCloseControls: () => void`
  - `LivePage` internal: `historyOpen` state, `handleSheetSnap(s)`, `handleHistoryOpen(open)`

- [ ] **Step 1: RED — phone layout today**

With the test stack running (Task 1 build), create `.context/ms2.cjs`:

```js
const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_EXE, args: ["--headless=new", "--use-angle=metal", "--enable-gpu"] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const state = () => page.evaluate(() => {
    const sheet = document.querySelector(".bottom-sheet");
    return {
      sidePanel: !!document.querySelector(".boat-panel:not(.boat-panel--collapsed)"),
      sheetHeight: sheet ? Math.round(sheet.getBoundingClientRect().height) : null,
      controlsOpen: !!document.querySelector(".controls-panel:not(.controls-panel--hidden)"),
      historyOpen: !document.querySelector(".history-slider--collapsed"),
    };
  });
  const out = {};
  await page.goto("http://localhost:3100/e/vr-2026");
  await page.waitForFunction(() => document.querySelectorAll(".vessel-marker").length >= 30, null, { timeout: 60000 });
  await page.waitForTimeout(2000);
  out.firstVisit = await state();
  await page.screenshot({ path: ".context/ms2-first.png" });
  const handle = page.locator(".bottom-sheet__handle");
  if (await handle.count()) {
    const box = await handle.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + 5);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y - 330, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(600);
    out.afterDragUp = await state();
    await page.reload();
    await page.waitForSelector(".bottom-sheet");
    await page.waitForTimeout(1500);
    out.afterReload = await state();
    await page.click(".header__controls-toggle");
    await page.waitForTimeout(500);
    out.afterControls = await state();
    await page.click(".history-slider__toggle");
    await page.waitForTimeout(500);
    out.afterHistory = await state();
    const h2 = await page.locator(".bottom-sheet__handle").boundingBox();
    await page.mouse.click(h2.x + h2.width / 2, h2.y + 5);
    await page.waitForTimeout(600);
    out.afterHandleTap = await state();
    await page.click(".header__controls-toggle");
    await page.waitForTimeout(400);
    await page.mouse.click(200, 300);
    await page.waitForTimeout(400);
    out.afterMapTap = await state();
    out.attributionAboveSheet = await page.evaluate(() => {
      const a = document.querySelector(".mapboxgl-ctrl-bottom-right, .mapboxgl-ctrl-bottom-left");
      const s = document.querySelector(".bottom-sheet");
      return a && s ? a.getBoundingClientRect().bottom <= s.getBoundingClientRect().top + 1 : null;
    });
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.waitForTimeout(800);
    out.resizedToDesktop = await state();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(800);
    out.resizedBackToPhone = await state();
  }
  console.log(JSON.stringify(out));
  await browser.close();
})();
```

Run it. Expected (current code): `firstVisit` shows `"sidePanel":true,"sheetHeight":null,"controlsOpen":true` and no further keys (no sheet).

- [ ] **Step 2: Create `src/components/BottomSheet.tsx`**

```tsx
import { ReactNode, useEffect, useRef, useState } from "react";

export type SheetSnap = "bar" | "half" | "full";

const ORDER: SheetSnap[] = ["bar", "half", "full"];
/** Handle plus the search/sort row. */
const BAR_PX = 76;
const SNAP_FRACTION = { half: 0.45, full: 0.85 };
const TAP_SLOP_PX = 6;
/** Release speed (px/ms) that counts as a flick to the next height. */
const FLICK_PX_PER_MS = 0.5;

export function sheetHeight(snap: SheetSnap, viewport = window.innerHeight): number {
  return snap === "bar" ? BAR_PX : Math.round(viewport * SNAP_FRACTION[snap]);
}

interface BottomSheetProps {
  snap: SheetSnap;
  onSnapChange: (snap: SheetSnap) => void;
  children: ReactNode;
}

/** Draggable bottom sheet with three heights (phones). Tap the handle to toggle bar ↔ half. */
export default function BottomSheet({ snap, onSnapChange, children }: BottomSheetProps) {
  const [viewport, setViewport] = useState(() => window.innerHeight);
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const drag = useRef<{ startY: number; startH: number; lastY: number; lastT: number; v: number } | null>(null);

  useEffect(() => {
    const onResize = () => setViewport(window.innerHeight);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const heights = ORDER.map((s) => sheetHeight(s, viewport));
  const height = dragHeight ?? sheetHeight(snap, viewport);

  const onPointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { startY: e.clientY, startH: height, lastY: e.clientY, lastT: e.timeStamp, v: 0 };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dt = e.timeStamp - d.lastT;
    if (dt > 0) d.v = (d.lastY - e.clientY) / dt; // positive = upwards
    d.lastY = e.clientY;
    d.lastT = e.timeStamp;
    if (dragHeight === null && Math.abs(e.clientY - d.startY) < TAP_SLOP_PX) return;
    setDragHeight(Math.max(heights[0], Math.min(heights[2], d.startH + (d.startY - e.clientY))));
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    setDragHeight(null);
    if (Math.abs(e.clientY - d.startY) < TAP_SLOP_PX) {
      onSnapChange(snap === "bar" ? "half" : "bar");
      return;
    }
    const h = d.startH + (d.startY - e.clientY);
    let next: number;
    if (Math.abs(d.v) > FLICK_PX_PER_MS) {
      next = ORDER.indexOf(snap) + Math.sign(d.v);
    } else {
      next = heights.reduce((best, x, i) => (Math.abs(x - h) < Math.abs(heights[best] - h) ? i : best), 0);
    }
    onSnapChange(ORDER[Math.max(0, Math.min(ORDER.length - 1, next))]);
  };

  return (
    <div className={`bottom-sheet ${dragHeight !== null ? "bottom-sheet--dragging" : ""}`} style={{ height }}>
      <div
        className="bottom-sheet__handle"
        role="button"
        aria-label={snap === "bar" ? "Show boats" : "Hide boats"}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div className="bottom-sheet__grip" />
      </div>
      <div className="bottom-sheet__content">{children}</div>
    </div>
  );
}
```

- [ ] **Step 3: Controlled history panel in `src/components/HistorySlider.tsx`**

Add to `HistorySliderProps`:

```ts
  /** Whether the panel is open (owned by the page, so phones can keep one panel open at a time). */
  expanded: boolean;
  onExpandedChange: (open: boolean) => void;
```

Destructure `expanded, onExpandedChange` in the component parameters, delete `const [expanded, setExpanded] = useState(false);`, and add right after the parameters:

```ts
  const setExpanded = onExpandedChange;
```

Add `setExpanded` to the dependency array of `handleGoLive` (`[onTimeChange, stopPlayback, simTimeRef, setExpanded]`).

- [ ] **Step 4: Map handle in `src/components/LiveMap.tsx`**

Replace `interface LiveMapHandle` and the `useImperativeHandle` call:

```ts
export interface LiveMapHandle {
  flyTo: (coords: [number, number]) => void;
  /** Pan to the boat without changing zoom. */
  centerOn: (coords: [number, number]) => void;
  /** Keep centring/following clear of the phone sheet. */
  setBottomPadding: (px: number) => void;
}
```

```ts
  useImperativeHandle(ref, () => ({
    flyTo: (coords: [number, number]) => {
      map.current?.flyTo({ center: coords, zoom: 17, speed: 2 });
    },
    centerOn: (coords: [number, number]) => {
      map.current?.easeTo({ center: coords, duration: 600 });
    },
    setBottomPadding: (px: number) => {
      map.current?.setPadding({ top: 0, left: 0, right: 0, bottom: px });
    },
  }));
```

- [ ] **Step 5: App and EventScope plumbing**

`src/components/EventScope.tsx` — import `import type { SheetSnap } from "./BottomSheet";` and extend `EventScopeProps` with:

```ts
  isPhone: boolean;
  sheetSnap: SheetSnap;
  onSheetSnapChange: (snap: SheetSnap) => void;
  onCloseControls: () => void;
```

(They pass through `...pageProps` unchanged.)

`src/App.tsx`:
- Imports: `import { isPhoneNow, useIsPhone } from "./hooks/useIsPhone";`, `import type { SheetSnap } from "./components/BottomSheet";`
- Replace the `controlsOpen` state and `toggleControls` with:

```tsx
  const isPhone = useIsPhone();
  // Phones start with the map clear; desktop keeps the controls open by default
  const [controlsOpen, setControlsOpenState] = useState(() => {
    const saved = localStorage.getItem("controlsOpen");
    return saved === null ? !isPhoneNow() : saved !== "false";
  });
  const setControlsOpen = useCallback((open: boolean) => {
    localStorage.setItem("controlsOpen", String(open));
    setControlsOpenState(open);
  }, []);
  const closeControls = useCallback(() => setControlsOpen(false), [setControlsOpen]);

  const [sheetSnap, setSheetSnapState] = useState<SheetSnap>(
    () => (localStorage.getItem("boatSheetSnap") as SheetSnap) || "bar",
  );
  const setSheetSnap = useCallback((snap: SheetSnap) => {
    localStorage.setItem("boatSheetSnap", snap);
    setSheetSnapState(snap);
  }, []);

  const toggleControls = useCallback(() => {
    const open = !controlsOpen;
    setControlsOpen(open);
    if (open && isPhone) setSheetSnap("bar");
  }, [controlsOpen, isPhone, setControlsOpen, setSheetSnap]);

  // ⛵ on phones raises/lowers the boat sheet; on desktop it toggles the side panel
  const toggleBoats = useCallback(() => {
    if (!isPhone) return togglePanel();
    const raise = sheetSnap === "bar";
    setSheetSnap(raise ? "half" : "bar");
    if (raise) setControlsOpen(false);
  }, [isPhone, sheetSnap, setSheetSnap, setControlsOpen, togglePanel]);
```

- Header ⛵ button: `onClick={toggleBoats}`.
- `<EventScope …>` gains:

```tsx
            isPhone={isPhone}
            sheetSnap={sheetSnap}
            onSheetSnapChange={setSheetSnap}
            onCloseControls={closeControls}
```

- [ ] **Step 6: Phone branch in `src/pages/LivePage.tsx`**

Imports:

```ts
import BoatList from "../components/BoatList";
import BottomSheet, { SheetSnap, sheetHeight } from "../components/BottomSheet";
```

`LivePageProps` adds `isPhone: boolean; sheetSnap: SheetSnap; onSheetSnapChange: (s: SheetSnap) => void; onCloseControls: () => void;` and the component destructures them.

Add after the `followedBoatId` state:

```tsx
  const [historyOpen, setHistoryOpen] = useState(false);

  // Phones: the sheet, controls and history never cover each other
  const handleSheetSnap = useCallback((snap: SheetSnap) => {
    onSheetSnapChange(snap);
    if (snap !== "bar") {
      onCloseControls();
      setHistoryOpen(false);
    }
  }, [onSheetSnapChange, onCloseControls]);

  const handleHistoryOpen = useCallback((open: boolean) => {
    setHistoryOpen(open);
    if (open && isPhone) {
      onCloseControls();
      onSheetSnapChange("bar");
    }
  }, [isPhone, onCloseControls, onSheetSnapChange]);

  useEffect(() => {
    if (isPhone && controlsOpen) setHistoryOpen(false);
  }, [isPhone, controlsOpen]);

  // Keep centring and following above the sheet
  useEffect(() => {
    mapRef.current?.setBottomPadding(isPhone ? sheetHeight(sheetSnap) : 0);
  }, [isPhone, sheetSnap]);

  // The map registers its click handler once, so read the latest values from refs
  const isPhoneRef = useRef(isPhone);
  isPhoneRef.current = isPhone;
  const closeControlsRef = useRef(onCloseControls);
  closeControlsRef.current = onCloseControls;
```

Replace `handleClearActive` with:

```tsx
  const handleClearActive = useCallback(() => {
    setActiveBoatId(null);
    setFollowedBoatId(null);
    if (isPhoneRef.current) closeControlsRef.current();
  }, []);
```

Root element: `<div className="map-view live-view" style={{ "--sheet-height": `${isPhone ? sheetHeight(sheetSnap) : 0}px` } as React.CSSProperties}>`.

Replace the `<BoatPanel … />` element with:

```tsx
        {isPhone ? (
          <BottomSheet snap={sheetSnap} onSnapChange={handleSheetSnap}>
            <BoatList
              crews={crews}
              vesselsData={displayData}
              stats={stats}
              activeBoatId={activeBoatId}
              followedBoatId={followedBoatId}
              onSelect={(id) => {
                setActiveBoatId(id);
                handleFocusBoat(id);
              }}
            />
          </BottomSheet>
        ) : (
          <BoatPanel
            crews={crews}
            vesselsData={displayData}
            stats={stats}
            activeBoatId={activeBoatId}
            followedBoatId={followedBoatId}
            collapsed={panelCollapsed}
            onToggleCollapsed={onTogglePanel}
            onSelect={(id) => {
              setActiveBoatId(id);
              handleFocusBoat(id);
            }}
          />
        )}
```

(Task 3 replaces the phone `onSelect` and adds the card.)

`<HistorySlider … />` gains `expanded={historyOpen}` and `onExpandedChange={handleHistoryOpen}`.

In `handleBoatClick`, guard the panel toggle so phones don't touch the desktop panel: `if (panelCollapsed && !isPhone) onTogglePanel();` and add `isPhone` to its dependency array. (Task 3 replaces this handler.)

- [ ] **Step 7: Phone CSS in `src/App.css`** (append at the end)

```css
/* ---- Phone bottom sheet ---- */
.bottom-sheet {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 12;
  display: flex;
  flex-direction: column;
  background: var(--panel-bg-solid);
  color: var(--panel-text);
  border-top-left-radius: 14px;
  border-top-right-radius: 14px;
  box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.45);
  padding-bottom: env(safe-area-inset-bottom, 0px);
  transition: height 0.25s ease;
  overflow: hidden;
}

.bottom-sheet--dragging {
  transition: none;
}

.bottom-sheet__handle {
  flex-shrink: 0;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: grab;
  touch-action: none;
}

.bottom-sheet__grip {
  width: 38px;
  height: 4px;
  border-radius: 2px;
  background: var(--panel-text-muted);
  opacity: 0.6;
}

.bottom-sheet__content {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.bottom-sheet .boat-panel__list {
  padding-right: 10px;
}

.bottom-sheet .boat-card {
  width: auto;
}

@media (max-width: 767px) {
  /* Everything that sat at the bottom of the map now sits above the sheet */
  .controls-stack {
    bottom: calc(var(--sheet-height, 0px) + 12px);
  }

  .live-dot {
    bottom: calc(var(--sheet-height, 0px) + 12px);
  }

  .wind-legend {
    bottom: var(--sheet-height, 0px);
  }

  .mapboxgl-ctrl-bottom-left,
  .mapboxgl-ctrl-bottom-right {
    bottom: var(--sheet-height, 0px);
  }
}
```

- [ ] **Step 8: Verify (Review Focus 1, 4)**

Type-check, lint, build as in Global Constraints. Rebuild and restart the preview, then run `.context/ms2.cjs`.

Expected JSON (heights for 844 px viewport: bar 76, half 380, full 717):
- `firstVisit`: `{"sidePanel":false,"sheetHeight":76,"controlsOpen":false,"historyOpen":false}`
- `afterDragUp`: `sheetHeight` 380 (half), `controlsOpen` false
- `afterReload`: `sheetHeight` 380 (remembered)
- `afterControls`: `sheetHeight` 76, `controlsOpen` true
- `afterHistory`: `controlsOpen` false, `historyOpen` true, `sheetHeight` 76
- `afterHandleTap`: `sheetHeight` 380, `historyOpen` false, `controlsOpen` false
- `afterMapTap`: `controlsOpen` false
- `attributionAboveSheet`: true
- `resizedToDesktop`: `sidePanel` true or false (follows panel state) and `sheetHeight` null
- `resizedBackToPhone`: `sheetHeight` 380, `sidePanel` false

Open `.context/ms2-first.png`: map visible, slim sheet with search row at the bottom, no controls panel.

Rerun `.context/ms1.cjs` (desktop) → same JSON as Task 1 Step 6.

- [ ] **Step 9: Commit**

```bash
git add src/components/BottomSheet.tsx src/App.tsx src/components/EventScope.tsx src/pages/LivePage.tsx src/components/HistorySlider.tsx src/components/LiveMap.tsx src/App.css
git commit -m "Show the boat list in a bottom sheet on phones

On screens under 768 px the boat list moves into a draggable sheet
(bar / half / full, remembered) and the map starts uncovered. Opening
controls or history lowers the sheet and closes the other; raising the
sheet closes both; tapping the map closes the controls. Map padding and
the overlays at the bottom of the map follow the sheet height.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Boat card on phones, desktop Following pill

**Files:**
- Create: `src/components/BoatCard.tsx`
- Modify: `src/pages/LivePage.tsx`, `src/App.css`

**Interfaces:**
- Consumes: `BottomSheet`, `sheetHeight`, `handleSheetSnap`, `LiveMapHandle.centerOn` (Task 2); `stats`, `formatDistanceNm` (Task 1); `toggleHighlight`, `highlightedCrews` from `useEventConfig()`.
- Produces: `<BoatCard crew data dtf position following highlighted isHistoryMode onToggleFollow onToggleHighlight onClose />`; `LivePage` state `cardBoatId: number | null`.

- [ ] **Step 1: RED — tapping a boat on a phone today**

Create `.context/ms3.cjs`:

```js
const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_EXE, args: ["--headless=new", "--use-angle=metal", "--enable-gpu"] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => localStorage.setItem("boatSheetSnap", "bar"));
  const page = await ctx.newPage();
  const out = {};
  await page.goto("http://localhost:3100/e/vr-2026");
  await page.waitForFunction(() => document.querySelectorAll(".vessel-marker").length >= 30, null, { timeout: 60000 });
  await page.waitForTimeout(2000);
  const card = () => page.evaluate(() => {
    const c = document.querySelector(".boat-detail");
    const sheet = document.querySelector(".bottom-sheet");
    return c ? {
      title: c.querySelector(".boat-detail__title")?.textContent,
      stats: [...c.querySelectorAll(".boat-detail__stat b")].map((b) => b.textContent),
      follow: c.querySelector(".boat-detail__follow")?.textContent,
      sheetHeight: Math.round(sheet.getBoundingClientRect().height),
    } : null;
  });
  await page.locator(".vessel-marker").nth(5).click({ force: true });
  await page.waitForTimeout(1500);
  out.afterTap = await card();
  out.pill = !!(await page.$(".follow-indicator"));
  out.markerAboveSheet = await page.evaluate(() => {
    const tapped = document.querySelectorAll(".vessel-marker")[5];
    const sheet = document.querySelector(".bottom-sheet");
    return tapped.getBoundingClientRect().bottom < sheet.getBoundingClientRect().top;
  });
  await page.screenshot({ path: ".context/ms3-card.png" });
  if (out.afterTap) {
    await page.click(".boat-detail__follow");
    await page.waitForTimeout(500);
    out.afterFollow = (await card())?.follow;
    const starBefore = await page.$eval(".boat-detail__star", (b) => b.classList.contains("boat-detail__star--active"));
    await page.click(".boat-detail__star");
    out.starToggled = starBefore !== (await page.$eval(".boat-detail__star", (b) => b.classList.contains("boat-detail__star--active")));
    await page.click(".boat-detail__close");
    await page.waitForTimeout(400);
    out.afterClose = { card: await card(), list: !!(await page.$(".bottom-sheet .boat-list")) };
    await page.locator(".bottom-sheet .boat-card__body").first().click();
    await page.waitForTimeout(800);
    out.listTapOpensCard = !!(await card());
    const h = await page.locator(".bottom-sheet__handle").boundingBox();
    await page.mouse.move(h.x + h.width / 2, h.y + 5);
    await page.mouse.down();
    await page.mouse.move(h.x + h.width / 2, h.y + 400, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(600);
    out.afterDragToBar = { card: await card(), list: !!(await page.$(".bottom-sheet .boat-list")) };
  }
  console.log(JSON.stringify(out));
  await browser.close();
})();
```

Run it. Expected (Task 2 code): `afterTap` null (no card), `pill` true.

- [ ] **Step 2: Create `src/components/BoatCard.tsx`**

```tsx
import { X } from "lucide-react";
import type { Crew } from "../hooks/useEventConfig";
import type { VesselDataPoint } from "../types/tripData";
import { formatDistanceNm } from "../hooks/useFleetStats";
import { getColorBySpeed } from "../utils/wind";
import { now as raceNow } from "../utils/clock";

interface BoatCardProps {
  crew: Crew;
  data: VesselDataPoint | undefined;
  dtf: number | undefined;
  position: number | undefined;
  following: boolean;
  highlighted: boolean;
  isHistoryMode: boolean;
  onToggleFollow: () => void;
  onToggleHighlight: () => void;
  onClose: () => void;
}

const DASH = "–";

function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}

/** Live: "2 min ago"; history: the time of the fix. */
function fixLabel(time: number | undefined, isHistoryMode: boolean): string {
  if (time == null) return DASH;
  if (isHistoryMode) return new Date(time * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const minutes = Math.max(0, Math.round((raceNow() / 1000 - time) / 60));
  return minutes < 1 ? "now" : `${minutes} min ago`;
}

/** Compact details for one boat, shown in the phone sheet. */
export default function BoatCard({
  crew, data, dtf, position, following, highlighted, isHistoryMode, onToggleFollow, onToggleHighlight, onClose,
}: BoatCardProps) {
  const num = (v: number | undefined, digits: number, unit: string) => (v == null ? DASH : `${v.toFixed(digits)}${unit}`);

  return (
    <div className="boat-detail" style={{ borderTopColor: crew.track_color }}>
      <div className="boat-detail__header">
        <span className="boat-card__dot" style={{ backgroundColor: crew.track_color }} />
        <strong className="boat-detail__title">#{crew.start_number} {crew.name}</strong>
        <button className="boat-detail__close" onClick={onClose} aria-label="Back to the boat list">
          <X size={18} />
        </button>
      </div>
      {crew.description && <div className="boat-detail__desc">{crew.description}</div>}
      <div className="boat-detail__stats">
        <div className="boat-detail__stat"><b>{num(data?.sog, 1, " kn")}</b><span>speed</span></div>
        <div className="boat-detail__stat"><b>{dtf == null ? DASH : formatDistanceNm(dtf)}</b><span>to finish</span></div>
        <div className="boat-detail__stat"><b>{position == null ? DASH : ordinal(position)}</b><span>place</span></div>
        <div className="boat-detail__stat">
          <b style={data?.tws != null ? { color: getColorBySpeed(data.tws) } : undefined}>{num(data?.tws, 1, " kn")}</b>
          <span>wind</span>
        </div>
        <div className="boat-detail__stat"><b>{num(data?.cog, 0, "°")}</b><span>course</span></div>
        <div className="boat-detail__stat"><b>{num(data?.twa == null ? undefined : Math.abs(data.twa), 0, "°")}</b><span>wind angle</span></div>
      </div>
      <div className="boat-detail__fix">Last fix: {fixLabel(data?.time, isHistoryMode)}</div>
      <div className="boat-detail__actions">
        <button className={`boat-detail__follow ${following ? "boat-detail__follow--on" : ""}`} onClick={onToggleFollow}>
          {following ? "Stop following" : "Follow"}
        </button>
        <button
          className={`boat-detail__star ${highlighted ? "boat-detail__star--active" : ""}`}
          onClick={onToggleHighlight}
        >
          {highlighted ? "★ Highlighted" : "☆ Highlight"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Card state and phone tap behaviour in `src/pages/LivePage.tsx`**

Imports: `import BoatCard from "../components/BoatCard";`. Change the `useEventConfig()` destructuring to also take `highlightedCrews, toggleHighlight`.

After the `historyOpen` state add:

```tsx
  const [cardBoatId, setCardBoatId] = useState<number | null>(null);

  // Phones: tapping a boat (map or list) opens its card and centres it, without following
  const openCard = useCallback((boatId: number) => {
    setActiveBoatId(boatId);
    setCardBoatId(boatId);
    if (sheetSnap === "bar") onSheetSnapChange("half");
    onCloseControls();
    setHistoryOpen(false);
    const coords = displayData[String(boatId)]?.coords;
    if (coords) mapRef.current?.centerOn(coords);
  }, [sheetSnap, onSheetSnapChange, onCloseControls, displayData]);

  const closeCard = useCallback(() => {
    setCardBoatId(null);
    setActiveBoatId(null);
  }, []);
```

In `handleSheetSnap`, add as the first line: `if (snap === "bar") setCardBoatId(null);`

Replace `handleBoatClick` with the version below. `useVesselMarkers` attaches each marker's click listener once, when the marker is created (`useVesselMarkers.tsx`, `el.addEventListener("click", …)`), so the map must get a stable function that always calls the latest handler:

```tsx
  const latestBoatClick = useRef<(boatId: number) => void>(() => {});
  latestBoatClick.current = (boatId: number) => {
    if (isPhone) {
      openCard(boatId);
      return;
    }
    setActiveBoatId(boatId);
    setFollowedBoatId(boatId);
    if (panelCollapsed) onTogglePanel();
  };
  // Stable identity: markers keep the function they were created with
  const handleBoatClick = useCallback((boatId: number) => latestBoatClick.current(boatId), []);
```

(This also fixes today's stale `panelCollapsed` in marker clicks.) Remove the Task 2 edit to the old `handleBoatClick` (the `!isPhone` guard) — it is superseded.

In `handleClearActive` add `setCardBoatId(null);`.

Replace the phone `<BottomSheet>` children with:

```tsx
          <BottomSheet snap={sheetSnap} onSnapChange={handleSheetSnap}>
            {cardBoatId != null && crews.some((c) => c.id === cardBoatId) ? (
              <BoatCard
                crew={crews.find((c) => c.id === cardBoatId)!}
                data={displayData[String(cardBoatId)]}
                dtf={stats.dtf.get(cardBoatId)}
                position={stats.position.get(cardBoatId)}
                following={followedBoatId === cardBoatId}
                highlighted={highlightedCrews.has(cardBoatId)}
                isHistoryMode={isHistoryMode}
                onToggleFollow={() => setFollowedBoatId((f) => (f === cardBoatId ? null : cardBoatId))}
                onToggleHighlight={() => toggleHighlight(cardBoatId)}
                onClose={closeCard}
              />
            ) : (
              <BoatList
                crews={crews}
                vesselsData={displayData}
                stats={stats}
                activeBoatId={activeBoatId}
                followedBoatId={followedBoatId}
                onSelect={openCard}
              />
            )}
          </BottomSheet>
```

Replace the Following pill block so it only renders on desktop and moves beside the open panel:

```tsx
      {!isPhone && followedBoatId != null && (() => {
        const crew = crews.find((c) => c.id === followedBoatId);
        return (
          <div
            className={`follow-indicator ${panelCollapsed ? "" : "follow-indicator--beside-panel"}`}
            onClick={handleStopFollow}
          >
            <span className="follow-indicator__dot" />
            Following {crew?.name ?? `#${followedBoatId}`} — tap to stop
          </div>
        );
      })()}
```

- [ ] **Step 4: Card and pill CSS in `src/App.css`** (append)

```css
/* ---- Phone boat card ---- */
.boat-detail {
  padding: 4px 14px 12px;
  border-top: 3px solid transparent;
  overflow-y: auto;
}

.boat-detail__header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
}

.boat-detail__title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.boat-detail__close {
  background: none;
  border: none;
  color: var(--panel-text-muted);
  padding: 4px;
  cursor: pointer;
}

.boat-detail__desc {
  color: var(--panel-text-muted);
  font-size: 12px;
  margin: 2px 0 10px;
}

.boat-detail__stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px 8px;
}

.boat-detail__stat b {
  display: block;
  font-size: 17px;
  font-weight: 700;
}

.boat-detail__stat span {
  color: var(--panel-text-muted);
  font-size: 11px;
}

.boat-detail__fix {
  color: var(--panel-text-muted);
  font-size: 11px;
  margin: 10px 0;
}

.boat-detail__actions {
  display: flex;
  gap: 8px;
}

.boat-detail__actions button {
  flex: 1;
  padding: 10px 0;
  border-radius: 8px;
  border: 1px solid var(--panel-border);
  background: var(--panel-bg);
  color: var(--panel-text);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.boat-detail__follow {
  background: #2563eb !important;
  border-color: #2563eb !important;
  color: #fff !important;
}

.boat-detail__follow--on {
  background: #166534 !important;
  border-color: #166534 !important;
}

.boat-detail__star--active {
  color: #facc15 !important;
}

/* Desktop: keep the Following pill clear of the open side panel */
.follow-indicator--beside-panel {
  left: 262px;
}
```

- [ ] **Step 5: Type-check, lint, build**

As in Global Constraints.

- [ ] **Step 6: Verify (Review Focus 2, 3, 5)**

Rebuild, restart the preview, run `.context/ms3.cjs`.

Expected JSON:
- `afterTap`: `title` like `"#… <name>"`, `stats` 6 values with no `"–"` for speed/to finish/wind (replay has data), `follow` `"Follow"`, `sheetHeight` 380
- `pill`: false
- `markerAboveSheet`: true
- `afterFollow`: `"Stop following"`
- `starToggled`: true
- `afterClose`: `{"card":null,"list":true}`
- `listTapOpensCard`: true
- `afterDragToBar`: `{"card":null,"list":true}`

Open `.context/ms3-card.png`: card in the sheet, tapped boat visible above it.

Card with missing data (Review Focus 3): every boat in the VR 2026 replay has data, so check by reading `BoatCard.tsx` that every value goes through `num()`, `DASH` or a `== null` guard (speed, to finish, place, wind, course, wind angle, last fix) and record that in the ledger.

Rerun `.context/ms1.cjs` (desktop): `pill` text present; additionally check `getComputedStyle(document.querySelector(".follow-indicator")).left` is `"262px"` while the panel is open (add to the script's `after` object: `pillLeft: getComputedStyle(document.querySelector(".follow-indicator")).left`) → `"262px"`.

Rerun `.context/ms2.cjs` → same as Task 2 Step 8.

- [ ] **Step 7: Commit**

```bash
git add src/components/BoatCard.tsx src/pages/LivePage.tsx src/App.css
git commit -m "Show a boat card in the phone sheet when a boat is tapped

Tapping a boat on a phone (map or list) opens a compact card in the
sheet with speed, distance to finish, place, wind, course, wind angle
and fix age, plus Follow and Highlight buttons, and centres the boat
above the sheet instead of covering it with the full list. The
Following pill is desktop-only and no longer covers the side panel.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```
