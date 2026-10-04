import * as clock from "../clock.js";
import { floorHour } from "../time.js";
import {
  existsSync,
  fixturePaths,
  loadFixture,
  readGzJson,
  readJson,
  type Fixture,
} from "./fixtures.js";
import {
  UpstreamError,
  type DataHour,
  type RawEvent,
  type RawEventLeg,
  type RawLive,
  type RawTails,
  type SlimPoint,
  type Upstream,
  type WindModel,
  type WindPoint,
  type WindRegion,
} from "./types.js";

const TRACK_LENGTH_S = 10800; // upstream's default tail length (3 h)
const FORECAST_HOURS = 4;

const toSeconds = (iso: string) => Math.floor(Date.parse(iso) / 1000);

function latestPoint(points: SlimPoint[]): SlimPoint | undefined {
  let best: SlimPoint | undefined;
  for (const p of points) {
    if (!best || p.time > best.time) best = p;
  }
  return best;
}

/** Serves a recorded fixture as if the race were live at clock.now(). */
export class ReplayUpstream implements Upstream {
  private readonly fixture: Fixture;
  private readonly paths: ReturnType<typeof fixturePaths>;
  private readonly hours = new Map<number, DataHour>();
  private readonly wind = new Map<WindModel, Record<string, WindPoint[]>>();

  constructor(slug: string) {
    this.fixture = loadFixture(slug);
    this.paths = fixturePaths(slug);
  }

  async getEvent(slug: string): Promise<RawEvent> {
    const { manifest, event, legs } = this.fixture;
    if (slug !== manifest.slug && slug !== String(manifest.eventId)) {
      throw new UpstreamError(404, `Event ${slug} is not recorded`);
    }
    return { ...event, cc_event_leg: legs };
  }

  async getLive(eventId: string): Promise<RawLive> {
    this.assertEvent(eventId);
    const now = clock.nowSeconds();
    const leg = this.currentLeg(now);
    const objects: Record<string, SlimPoint> = {};

    if (leg) {
      // Walk back from the current hour; the first hit per vessel is its latest position
      for (let h = floorHour(now); h >= floorHour(toSeconds(leg.start)); h -= 3600) {
        for (const [vesselId, points] of Object.entries(this.visibleHour(h, now))) {
          if (vesselId in objects) continue;
          const latest = latestPoint(points);
          if (latest) objects[vesselId] = latest;
        }
      }
    }

    return { updateInterval: 10, objects };
  }

  async getTails(eventId: string, legId: string): Promise<RawTails> {
    this.assertEvent(eventId);
    const leg = this.fixture.legs.find((l) => String(l.id) === legId);
    if (!leg) throw new UpstreamError(404, `Leg ${legId} is not recorded`);

    const now = clock.nowSeconds();
    const from = Math.max(toSeconds(leg.start), now - TRACK_LENGTH_S);
    const to = Math.min(now, toSeconds(leg.end));
    const tails: Record<string, number[][]> = {};

    for (let h = floorHour(from); h <= floorHour(to); h += 3600) {
      for (const [vesselId, points] of Object.entries(this.visibleHour(h, now))) {
        for (const p of points) {
          if (p.time < from || p.time > to) continue;
          (tails[vesselId] ??= []).push([p.time, p.coords[0], p.coords[1]]);
        }
      }
    }
    for (const points of Object.values(tails)) {
      points.sort((a, b) => a[0] - b[0]);
    }

    return { beginDate: leg.start, trackLengthMax: TRACK_LENGTH_S, tails };
  }

  async getLeg(eventId: string, legId: string): Promise<unknown> {
    this.assertEvent(eventId);
    // Only recorded leg ids reach the filesystem (legId comes straight from the URL)
    const path = this.paths.leg(legId);
    if (!this.fixture.manifest.legIds.includes(Number(legId)) || !existsSync(path)) {
      throw new UpstreamError(404, `Leg ${legId} is not recorded`);
    }
    return readJson(path);
  }

  async getDataHour(eventId: string, hourStart: number): Promise<DataHour> {
    this.assertEvent(eventId);
    return this.visibleHour(hourStart, clock.nowSeconds());
  }

  async getWind(model: WindModel, region: WindRegion): Promise<WindPoint[]> {
    let byRegion = this.wind.get(model);
    if (!byRegion) {
      const path = this.paths.wind(model);
      if (!existsSync(path)) throw new UpstreamError(404, `No recorded wind for ${model}`);
      byRegion = readGzJson<Record<string, WindPoint[]>>(path);
      this.wind.set(model, byRegion);
    }

    const points = byRegion[region.name];
    if (!points) throw new UpstreamError(404, `No recorded wind for region ${region.name}`);

    // Open-Meteo hourly times are UTC "YYYY-MM-DDTHH:MM"
    const hourKey = new Date(floorHour(clock.nowSeconds()) * 1000).toISOString().slice(0, 16);

    return points.map((p) => {
      const hourly = p.hourly;
      const idx = hourly ? hourly.time.indexOf(hourKey) : -1;
      if (!hourly || idx < 0) throw new UpstreamError(404, `No recorded wind at ${hourKey}`);
      const end = idx + FORECAST_HOURS;
      return {
        ...p,
        hourly: {
          time: hourly.time.slice(idx, end),
          wind_speed_10m: hourly.wind_speed_10m.slice(idx, end),
          wind_direction_10m: hourly.wind_direction_10m.slice(idx, end),
        },
      };
    });
  }

  private assertEvent(eventId: string) {
    if (eventId !== String(this.fixture.manifest.eventId)) {
      throw new UpstreamError(404, `Event ${eventId} is not recorded`);
    }
  }

  /** The latest recorded leg that has started by `now`, if any. */
  private currentLeg(now: number): RawEventLeg | undefined {
    return [...this.fixture.legs]
      .sort((a, b) => toSeconds(a.start) - toSeconds(b.start))
      .filter((l) => toSeconds(l.start) <= now)
      .pop();
  }

  /** Recorded hour as seen at `now`: future hours are empty, the current one is cut at `now`. */
  private visibleHour(hourStart: number, now: number): DataHour {
    if (hourStart > now) return {};
    const data = this.readHour(hourStart);
    if (hourStart + 3600 <= now) return data;

    const visible: DataHour = {};
    for (const [vesselId, points] of Object.entries(data)) {
      const upToNow = points.filter((p) => p.time <= now);
      if (upToNow.length > 0) visible[vesselId] = upToNow;
    }
    return visible;
  }

  private readHour(hourStart: number): DataHour {
    let data = this.hours.get(hourStart);
    if (!data) {
      const path = this.paths.dataHour(hourStart);
      data = existsSync(path) ? readGzJson<DataHour>(path) : {};
      this.hours.set(hourStart, data);
    }
    return data;
  }
}
