import { Router } from "express";

const router = Router();

type WindModel = "icon_2i" | "ecmwf";

const MODEL_PARAMS: Record<WindModel, string> = {
  icon_2i: "italia_meteo_arpae_icon_2i",
  ecmwf: "ecmwf_ifs025",
};

// Three coastal rectangles following the Dubrovnik–Murter race corridor
const REGIONS = [
  {
    name: "south",    // Dubrovnik to Korčula
    minLat: 42.4, maxLat: 43.1,
    minLng: 16.4, maxLng: 18.2,
    latSteps: 8, lngSteps: 12,
  },
  {
    name: "middle",   // Korčula to Split
    minLat: 43.0, maxLat: 43.6,
    minLng: 15.6, maxLng: 17.2,
    latSteps: 8, lngSteps: 12,
  },
  {
    name: "north",    // Split to Murter/Zadar
    minLat: 43.4, maxLat: 44.1,
    minLng: 15.0, maxLng: 16.5,
    latSteps: 8, lngSteps: 12,
  },
];

const CACHE_TTL_MS = 60 * 60 * 1000;

interface CacheEntry {
  data: unknown;
  fetchedAt: number;
}

const cache = new Map<WindModel, CacheEntry>();
const inflight = new Map<WindModel, Promise<unknown>>();

function buildRegionUrl(
  region: (typeof REGIONS)[number],
  model: WindModel,
): string {
  const dlat = (region.maxLat - region.minLat) / (region.latSteps - 1);
  const dlng = (region.maxLng - region.minLng) / (region.lngSteps - 1);

  const lats: string[] = [];
  const lngs: string[] = [];
  for (let row = 0; row < region.latSteps; row++) {
    for (let col = 0; col < region.lngSteps; col++) {
      lats.push((region.minLat + row * dlat).toFixed(2));
      lngs.push((region.minLng + col * dlng).toFixed(2));
    }
  }

  return (
    `https://api.open-meteo.com/v1/forecast?` +
    `latitude=${lats.join(",")}&longitude=${lngs.join(",")}` +
    `&hourly=wind_speed_10m,wind_direction_10m` +
    `&models=${MODEL_PARAMS[model]}&forecast_hours=4`
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchAllRegions(model: WindModel): Promise<unknown> {
  const regions = [];

  for (let i = 0; i < REGIONS.length; i++) {
    if (i > 0) await sleep(300);
    const region = REGIONS[i];
    const url = buildRegionUrl(region, model);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Open-Meteo ${response.status}`);
    const data = await response.json();
    const points = Array.isArray(data) ? data : [data];

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
  for (const model of Object.keys(MODEL_PARAMS) as WindModel[]) {
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
