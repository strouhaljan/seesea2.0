import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import type { WindModel } from "./types.js";

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

export function writeJson(path: string, data: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
}

export function writeGzJson(path: string, data: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, gzipSync(JSON.stringify(data), { level: 9 }));
}

export function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

export function readGzJson<T>(path: string): T {
  return JSON.parse(gunzipSync(readFileSync(path)).toString("utf8")) as T;
}

export { existsSync };
