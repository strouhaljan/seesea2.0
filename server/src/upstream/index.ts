import { replay } from "../clock.js";
import { HttpUpstream } from "./http.js";
import { ReplayUpstream } from "./replay.js";
import type { Upstream } from "./types.js";

export const upstream: Upstream = replay ? new ReplayUpstream(replay.slug) : new HttpUpstream();

export * from "./types.js";
