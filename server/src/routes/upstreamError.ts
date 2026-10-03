import type { Response } from "express";
import { UpstreamError } from "../upstream/index.js";

/** Upstream non-2xx → same status + "Upstream error"; anything else (network, parse) → 502. */
export function sendUpstreamError(res: Response, err: unknown, message: string) {
  if (err instanceof UpstreamError) {
    res.status(err.status).json({ error: "Upstream error" });
  } else {
    res.status(502).json({ error: message });
  }
}
