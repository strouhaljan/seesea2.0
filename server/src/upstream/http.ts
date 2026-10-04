import { toUpstreamTime } from "../time.js";
import { MODEL_PARAMS, gridQuery } from "./regions.js";
import {
  UpstreamError,
  type DataHour,
  type RawEvent,
  type RawLive,
  type RawTails,
  type SlimPoint,
  type Upstream,
  type WindModel,
  type WindPoint,
  type WindRegion,
} from "./types.js";

const SEESEA_API_URL = process.env.SEESEA_API_URL ?? "https://app.seesea.cz/api";
const OPEN_METEO_URL = process.env.OPEN_METEO_URL ?? "https://api.open-meteo.com/v1";
const OPEN_METEO_HISTORICAL_URL = "https://historical-forecast-api.open-meteo.com/v1";
const WIND_VARS = "hourly=wind_speed_10m,wind_direction_10m";
/** A hanging upstream must not hold requests (and the app shell) open indefinitely. */
const UPSTREAM_TIMEOUT_MS = 20_000;

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
  if (!response.ok) {
    throw new UpstreamError(response.status, `Upstream ${response.status} for ${url}`);
  }
  return (await response.json()) as T;
}

function slim(p: SlimPoint): SlimPoint {
  return {
    time: p.time,
    coords: p.coords,
    hdg: p.hdg,
    cog: p.cog,
    sog: p.sog,
    tws: p.tws,
    twa: p.twa,
    aws: p.aws,
    awa: p.awa,
    stw: p.stw,
  };
}

function toPoints(data: WindPoint | WindPoint[]): WindPoint[] {
  return Array.isArray(data) ? data : [data];
}

export class HttpUpstream implements Upstream {
  getEvent(slug: string): Promise<RawEvent> {
    return getJson(`${SEESEA_API_URL}/cc_event/${slug}/`);
  }

  getLive(eventId: string): Promise<RawLive> {
    return getJson(`${SEESEA_API_URL}/cc_event/${eventId}/data/live`);
  }

  getTails(eventId: string, legId: string): Promise<RawTails> {
    return getJson(`${SEESEA_API_URL}/cc_event/${eventId}/data/live/${legId}/tails`);
  }

  getLeg(eventId: string, legId: string): Promise<unknown> {
    return getJson(`${SEESEA_API_URL}/cc_event/${eventId}/leg/${legId}/`);
  }

  async getDataHour(eventId: string, hourStart: number): Promise<DataHour> {
    const start = toUpstreamTime(hourStart);
    const end = toUpstreamTime(hourStart + 3600);
    const url = `${SEESEA_API_URL}/cc_event/${eventId}/data2/?gps_datetime_0=${encodeURIComponent(start)}&gps_datetime_1=${encodeURIComponent(end)}&page_size=1000000&detailed=1`;
    const data = await getJson<{ objects?: Record<string, SlimPoint[]> }>(url);

    // Slim the data before storing to save space
    const slimmed: DataHour = {};
    for (const [vesselId, points] of Object.entries(data.objects ?? {})) {
      slimmed[vesselId] = points.map(slim);
    }
    return slimmed;
  }

  async getWind(model: WindModel, region: WindRegion): Promise<WindPoint[]> {
    const url =
      `${OPEN_METEO_URL}/forecast?${gridQuery(region)}&${WIND_VARS}` +
      `&models=${MODEL_PARAMS[model]}&forecast_hours=4`;
    return toPoints(await getJson(url));
  }
}

/** Hourly wind for whole past UTC days (inclusive, YYYY-MM-DD). Used by the recorder. */
export async function getWindHistory(
  model: WindModel,
  region: WindRegion,
  startDate: string,
  endDate: string,
): Promise<WindPoint[]> {
  const url =
    `${OPEN_METEO_HISTORICAL_URL}/forecast?${gridQuery(region)}&${WIND_VARS}` +
    `&models=${MODEL_PARAMS[model]}&start_date=${startDate}&end_date=${endDate}`;
  return toPoints(await getJson(url));
}
