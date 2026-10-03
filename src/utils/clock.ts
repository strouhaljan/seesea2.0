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
