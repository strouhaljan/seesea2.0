/**
 * Race-time clock, synced once from the server's /api/clock. Outside replay
 * (or if the server can't be reached) it is the wall clock.
 *
 * Use now() for "what time is it in the race"; keep Date.now() for polling
 * backoff and "x seconds ago" text.
 */

import { takeBootClock } from "./boot";

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

const RESYNC_MS = 30_000;
/** Race-time drift beyond which we reload instead of nudging (e.g. the server restarted). */
const MAX_DRIFT_MS = 60_000;

let sync: { serverNow: number; syncedAt: number; speed: number; end: number } | null = null;
let replayInfo: ReplayInfo | null = null;

async function fetchClock(): Promise<ClockResponse | null> {
  try {
    const res = await fetch("/api/clock", { signal: AbortSignal.timeout(2000) });
    return res.ok ? ((await res.json()) as ClockResponse) : null;
  } catch {
    return null;
  }
}

function apply(data: ClockResponse & { replay: string }, syncedAt = performance.now()) {
  sync = {
    serverNow: data.now,
    syncedAt,
    speed: data.speed,
    end: data.end ?? Infinity,
  };
  if (replayInfo?.slug !== data.replay || replayInfo.speed !== data.speed) {
    replayInfo = { slug: data.replay, speed: data.speed };
  }
}

export async function initClock(): Promise<void> {
  // Usually already requested by index.html while the bundle downloaded
  const boot = takeBootClock();
  const first = boot ? await boot : { data: await fetchClock(), at: performance.now() };
  const data = first.data as ClockResponse | null;
  if (data?.replay) apply({ ...data, replay: data.replay }, first.at);

  // While replaying, keep in step with the server (a restart resets its clock).
  // If the server wasn't reachable yet, keep trying. Otherwise one sync is enough.
  if (!data || data.replay) {
    const id = setInterval(async () => {
      const next = await fetchClock();
      if (!next) return;
      if (!next.replay && !replayInfo) {
        clearInterval(id);
        return;
      }
      const changed =
        next.replay !== replayInfo?.slug ||
        next.speed !== replayInfo?.speed ||
        Math.abs(now() - next.now) > MAX_DRIFT_MS;
      // Replay switched on/off, speed changed or clock jumped: start clean
      if (changed) window.location.reload();
      else apply({ ...next, replay: next.replay! });
    }, RESYNC_MS);
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
