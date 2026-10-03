import { HttpUpstream } from "./http.js";
import type { Upstream } from "./types.js";

export const upstream: Upstream = new HttpUpstream();

export * from "./types.js";
