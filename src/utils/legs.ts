import type { EventLeg } from "../hooks/useEventConfig";

const ms = (iso: string) => Date.parse(iso);

/**
 * The leg to show at race time `now` (ms). Upstream's `active` flag is ignored:
 * most events' race legs have `active: 0`. Picks the running leg (the latest
 * start if several overlap, e.g. a weeks-long "preparation" leg), else the most
 * recently started, else the next one.
 */
export function pickCurrentLeg(legs: EventLeg[], now: number): EventLeg | null {
  const sorted = [...legs].sort((a, b) => ms(a.start) - ms(b.start));
  const started = sorted.filter((l) => ms(l.start) <= now);
  const running = started.filter((l) => now <= ms(l.end));
  return running[running.length - 1] ?? started[started.length - 1] ?? sorted[0] ?? null;
}

/** Legs in chronological order, for pickers. */
export function legsByStart(legs: EventLeg[]): EventLeg[] {
  return [...legs].sort((a, b) => ms(a.start) - ms(b.start));
}
