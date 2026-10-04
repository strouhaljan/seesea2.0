import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import type { RawEvent, RawEventLeg, WindModel } from "./types.js";

export const FIXTURES_DIR = resolve(process.env.FIXTURES_DIR ?? resolve(__dirname, "../../fixtures"));

export interface Manifest {
  slug: string;
  eventId: number;
  legIds: number[];
  recordedAt: string;
}

export function fixturePaths(slug: string) {
  const dir = resolve(FIXTURES_DIR, slug);
  return {
    dir,
    manifest: resolve(dir, "manifest.json"),
    event: resolve(dir, "event.json"),
    leg: (legId: number | string) => resolve(dir, "legs", `${legId}.json`),
    dataHour: (hourStart: number) => resolve(dir, "data2", `${hourStart}.json.gz`),
    wind: (model: WindModel) => resolve(dir, "wind", `${model}.json.gz`),
  };
}

/** Write via a temp file and rename, so an interrupted run can't leave a truncated file. */
function writeAtomic(path: string, contents: string | Buffer) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, contents);
  renameSync(tmp, path);
}

export function writeJson(path: string, data: unknown) {
  writeAtomic(path, JSON.stringify(data, null, 2) + "\n");
}

export function writeGzJson(path: string, data: unknown) {
  writeAtomic(path, gzipSync(JSON.stringify(data), { level: 9 }));
}

export function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

export function readGzJson<T>(path: string): T {
  return JSON.parse(gunzipSync(readFileSync(path)).toString("utf8")) as T;
}

export { existsSync };

export interface Fixture {
  manifest: Manifest;
  event: RawEvent;
  /** Event legs limited to the ones actually recorded. */
  legs: RawEventLeg[];
}

export function loadFixture(slug: string): Fixture {
  const paths = fixturePaths(slug);
  if (!existsSync(paths.manifest)) {
    throw new Error(
      `No fixture for "${slug}" in ${paths.dir}. Record it with: npm --prefix server run record -- ${slug}`,
    );
  }
  const manifest = readJson<Manifest>(paths.manifest);
  const event = readJson<RawEvent>(paths.event);
  const legs = (event.cc_event_leg ?? []).filter((l) => manifest.legIds.includes(l.id));
  return { manifest, event, legs };
}
