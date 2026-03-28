import { Router } from "express";

const router = Router();

type WindModel = "icon_2i" | "ecmwf";

const MODEL_PARAMS: Record<WindModel, string> = {
  icon_2i: "italia_meteo_arpae_icon_2i",
  ecmwf: "ecmwf_ifs025",
};

const GRID_BOUNDS = {
  minLat: 42.2,
  maxLat: 45.0,
  minLng: 14.0,
  maxLng: 18.2,
};
const LAT_STEPS = 15;
const LNG_STEPS = 20;
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

interface CacheEntry {
  data: unknown;
  fetchedAt: number;
}

const cache = new Map<WindModel, CacheEntry>();

function buildGridUrl(model: WindModel): string {
  const dlat = (GRID_BOUNDS.maxLat - GRID_BOUNDS.minLat) / (LAT_STEPS - 1);
  const dlng = (GRID_BOUNDS.maxLng - GRID_BOUNDS.minLng) / (LNG_STEPS - 1);

  const lats: string[] = [];
  const lngs: string[] = [];
  for (let row = 0; row < LAT_STEPS; row++) {
    for (let col = 0; col < LNG_STEPS; col++) {
      lats.push((GRID_BOUNDS.minLat + row * dlat).toFixed(2));
      lngs.push((GRID_BOUNDS.minLng + col * dlng).toFixed(2));
    }
  }

  return (
    `https://api.open-meteo.com/v1/forecast?` +
    `latitude=${lats.join(",")}&longitude=${lngs.join(",")}` +
    `&hourly=wind_speed_10m,wind_direction_10m` +
    `&models=${MODEL_PARAMS[model]}&forecast_hours=1`
  );
}

router.get("/:model", async (req, res) => {
  const model = req.params.model as WindModel;

  if (!MODEL_PARAMS[model]) {
    res.status(400).json({ error: `Unknown model: ${model}` });
    return;
  }

  const cached = cache.get(model);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    res.json(cached.data);
    return;
  }

  try {
    const url = buildGridUrl(model);
    const response = await fetch(url);
    if (!response.ok) {
      res.status(response.status).json({ error: "Open-Meteo error" });
      return;
    }

    const data = await response.json();

    cache.set(model, { data, fetchedAt: Date.now() });
    res.json(data);
  } catch {
    res.status(502).json({ error: "Failed to fetch wind data" });
  }
});

export default router;
