import { Router } from "express";
import { upstream, type WindModel } from "../upstream/index.js";
import { MODEL_PARAMS, REGIONS, WIND_MODELS } from "../upstream/regions.js";
import * as clock from "../clock.js";
import { floorHour, sleep } from "../time.js";

const router = Router();

const CACHE_TTL_MS = 60 * 60 * 1000;
/** Open-Meteo allows ~600 grid points a minute; both models together exceed that. */
const MODEL_WARM_GAP_MS = 61_000;
/** After a failed fetch (e.g. 429) leave Open-Meteo alone for this long. */
const FAILURE_COOLDOWN_MS = 60_000;

interface CacheEntry {
  data: unknown;
  fetchedAt: number;
  /** Race hour the 4-hour window starts at. */
  hour: number;
}

const cache = new Map<WindModel, CacheEntry>();
const inflight = new Map<WindModel, Promise<unknown>>();
const lastFailure = new Map<WindModel, number>();

async function fetchAllRegions(model: WindModel): Promise<unknown> {
  const regions = [];

  for (let i = 0; i < REGIONS.length; i++) {
    if (i > 0) await sleep(300);
    const region = REGIONS[i];
    const points = await upstream.getWind(model, region);

    regions.push({
      bounds: {
        minLat: region.minLat,
        maxLat: region.maxLat,
        minLng: region.minLng,
        maxLng: region.maxLng,
      },
      latSteps: region.latSteps,
      lngSteps: region.lngSteps,
      points,
    });
  }

  return regions;
}

async function getGridData(model: WindModel): Promise<unknown> {
  const hour = floorHour(clock.nowSeconds());
  const cached = cache.get(model);
  if (cached && cached.hour === hour && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.data;
  }

  const existing = inflight.get(model);
  if (existing) return existing;

  // Retrying right after a failure would only feed the rate limit
  const failedAt = lastFailure.get(model);
  if (failedAt && Date.now() - failedAt < FAILURE_COOLDOWN_MS) {
    if (cached) return cached.data;
    throw new Error(`Wind fetch for ${model} is cooling down after a failure`);
  }

  const promise = fetchAllRegions(model)
    .then((data) => {
      cache.set(model, { data, fetchedAt: Date.now(), hour });
      inflight.delete(model);
      lastFailure.delete(model);
      return data;
    })
    .catch((err) => {
      inflight.delete(model);
      lastFailure.set(model, Date.now());
      if (cached) {
        console.warn(`Open-Meteo fetch failed for ${model}, serving stale cache:`, err);
        return cached.data;
      }
      throw err;
    });

  inflight.set(model, promise);
  return promise;
}

export async function warmWindCache(): Promise<void> {
  for (const [i, model] of WIND_MODELS.entries()) {
    if (i > 0 && !clock.replay) await sleep(MODEL_WARM_GAP_MS);
    try {
      await getGridData(model);
      console.log(`Wind cache warmed for ${model}`);
    } catch (err) {
      console.warn(`Wind cache warming failed for ${model}:`, err);
    }
  }
}

router.get("/:model", async (req, res) => {
  const model = req.params.model as WindModel;

  if (!MODEL_PARAMS[model]) {
    res.status(400).json({ error: `Unknown model: ${model}` });
    return;
  }

  try {
    const data = await getGridData(model);
    res.json(data);
  } catch {
    res.status(502).json({ error: "Failed to fetch wind data" });
  }
});

export default router;
