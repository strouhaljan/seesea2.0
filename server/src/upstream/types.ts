export interface SlimPoint {
  time: number;
  coords: [number, number];
  hdg?: number;
  cog?: number;
  sog?: number;
  tws?: number;
  twa?: number;
  aws?: number;
  awa?: number;
  stw?: number;
}

/** One hour of history: vesselId → points. */
export type DataHour = Record<string, SlimPoint[]>;

export interface RawEventLeg {
  id: number;
  name: string;
  active: number;
  start: string;
  end: string;
  race_type: string;
}

export interface RawEvent {
  cc_event_id: number;
  slug: string;
  name?: string;
  event_start?: string;
  event_end?: string;
  default_lat?: number;
  default_lng?: number;
  cc_object?: unknown[];
  cc_event_leg?: RawEventLeg[];
  [key: string]: unknown;
}

export interface RawLive {
  updateInterval?: number;
  objects?: Record<string, unknown>;
}

export interface RawTails {
  beginDate?: string;
  trackLengthMax?: number;
  tails: Record<string, number[][]> | null;
}

export type WindModel = "icon_2i" | "ecmwf";

export interface WindRegion {
  name: string;
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  latSteps: number;
  lngSteps: number;
}

/** One grid point of an Open-Meteo multi-location response. */
export interface WindPoint {
  hourly?: {
    time: string[];
    wind_speed_10m: (number | null)[];
    wind_direction_10m: (number | null)[];
  };
  [key: string]: unknown;
}

/** Upstream answered with a non-2xx status (or replay has no such data). */
export class UpstreamError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "UpstreamError";
  }
}

export interface Upstream {
  getEvent(slug: string): Promise<RawEvent>;
  getLive(eventId: string): Promise<RawLive>;
  getTails(eventId: string, legId: string): Promise<RawTails>;
  getLeg(eventId: string, legId: string): Promise<unknown>;
  /** History for [hourStart, hourStart + 3600), slimmed to SlimPoint fields. */
  getDataHour(eventId: string, hourStart: number): Promise<DataHour>;
  /** Wind for one region: 4 hourly values starting at the current hour. */
  getWind(model: WindModel, region: WindRegion): Promise<WindPoint[]>;
}
