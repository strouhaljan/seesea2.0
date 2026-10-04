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
