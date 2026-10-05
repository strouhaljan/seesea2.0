/**
 * Startup requests begun by the inline script in index.html, so they run while
 * the app bundle downloads instead of one after another once it has loaded.
 * Each is handed out once; callers fall back to their own fetch.
 */
interface Boot {
  /** `at` is performance.now() when the answer arrived, for an exact replay clock. */
  clock?: Promise<{ data: unknown; at: number }>;
  events?: Promise<unknown>;
  event?: { slug: string; data: Promise<unknown> } | null;
}

declare global {
  interface Window {
    __boot?: Boot;
  }
}

export function takeBootClock(): Boot["clock"] | null {
  const boot = window.__boot;
  const clock = boot?.clock ?? null;
  if (boot) boot.clock = undefined;
  return clock;
}

export function takeBootEvents(): Promise<unknown> | null {
  const boot = window.__boot;
  const events = boot?.events ?? null;
  if (boot) boot.events = undefined;
  return events;
}

/** The prefetched config for `slug`, if the page was opened at /e/<slug>. */
export function takeBootEvent(slug: string): Promise<unknown> | null {
  const boot = window.__boot;
  const event = boot?.event;
  if (!boot || !event) return null;
  boot.event = null;
  try {
    return decodeURIComponent(event.slug) === slug ? event.data : null;
  } catch {
    return null;
  }
}
