import { useCallback, useEffect, useState } from "react";
import { eventPath, getEventSlugFromPath } from "../utils/route";
import { takeBootEvents } from "../utils/boot";

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
    const load =
      (takeBootEvents() as Promise<EventSummary[]> | null) ??
      fetch("/api/events").then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<EventSummary[]>;
      });
    load
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
