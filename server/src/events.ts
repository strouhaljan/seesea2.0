import * as clock from "./clock.js";
import { upstream, type RawEventLeg } from "./upstream/index.js";

/** Offered when nothing is configured — the client's built-in default before EVENTS existed. */
const DEFAULT_EVENT = "vr-2026";

function configuredSlugs(): string {
  if (clock.replay) return clock.replay.slug;
  // VITE_EVENT_SLUG keeps older .env files and deployments working
  const configured = process.env.EVENTS ?? process.env.EVENT_SLUG ?? process.env.VITE_EVENT_SLUG;
  if (configured?.trim()) return configured;
  console.warn(`No EVENTS configured, offering only ${DEFAULT_EVENT}. Set EVENTS=<slug,slug> to choose events.`);
  return DEFAULT_EVENT;
}

/** Events offered by this server, in display order. Replay serves only the recorded event. */
export const EVENT_SLUGS: string[] = configuredSlugs()
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export function isListedEvent(slug: string): boolean {
  return EVENT_SLUGS.includes(slug);
}

export interface EventConfig {
  slug: string;
  eventId: number;
  name: string;
  start: string;
  end: string;
  /** [lng, lat] the map opens at. */
  center: [number, number] | null;
  crews: unknown[];
  legs: RawEventLeg[];
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const cache = new Map<string, { config: EventConfig; fetchedAt: number }>();

export async function getEventConfig(slug: string): Promise<EventConfig> {
  const cached = cache.get(slug);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.config;

  const data = await upstream.getEvent(slug);
  const config: EventConfig = {
    slug,
    eventId: data.cc_event_id,
    name: data.name ?? slug,
    start: data.event_start ?? "",
    end: data.event_end ?? "",
    center:
      typeof data.default_lng === "number" && typeof data.default_lat === "number"
        ? [data.default_lng, data.default_lat]
        : null,
    crews: data.cc_object ?? [],
    legs: data.cc_event_leg ?? [],
  };

  cache.set(slug, { config, fetchedAt: Date.now() });
  return config;
}

/** Whether the event is on at race time `now` (ms). */
export function isRunning(config: EventConfig, now = clock.now()): boolean {
  return Date.parse(config.start) <= now && now <= Date.parse(config.end);
}
