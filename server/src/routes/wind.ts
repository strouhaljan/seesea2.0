import { Router } from "express";
import { upstream, type WindModel } from "../upstream/index.js";
import { MODEL_PARAMS, REGIONS, WIND_MODELS } from "../upstream/regions.js";
import { sleep } from "../time.js";

const router = Router();

const CACHE_TTL_MS = 60 * 60 * 1000;

interface CacheEntry {
  data: unknown;
  fetchedAt: number;
}

const cache = new Map<WindModel, CacheEntry>();
const inflight = new Map<WindModel, Promise<unknown>>();

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
  const cached = cache.get(model);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.data;
  }

  const existing = inflight.get(model);
  if (existing) return existing;

  const promise = fetchAllRegions(model)
    .then((data) => {
      cache.set(model, { data, fetchedAt: Date.now() });
      inflight.delete(model);
      return data;
    })
    .catch((err) => {
      inflight.delete(model);
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
  for (const model of WIND_MODELS) {
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
