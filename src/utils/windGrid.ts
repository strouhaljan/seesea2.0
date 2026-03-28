import { VesselDataPoint } from "../types/tripData";

export type WindModel = "icon_2i" | "ecmwf";

const MODEL_PARAMS: Record<WindModel, string> = {
  icon_2i: "italia_meteo_arpae_icon_2i",
  ecmwf: "ecmwf_ifs025",
};

// Grid covering the Adriatic from Dubrovnik to north of race area
const GRID_BOUNDS = {
  minLat: 42.2,
  maxLat: 45.0,
  minLng: 14.0,
  maxLng: 18.2,
};
const LAT_STEPS = 15;
const LNG_STEPS = 20;
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

export interface WindGridData {
  bounds: typeof GRID_BOUNDS;
  latSteps: number;
  lngSteps: number;
  dlat: number;
  dlng: number;
  u: Float32Array; // east-west component (m/s), row-major
  v: Float32Array; // north-south component (m/s), row-major
  speed: Float32Array; // magnitude (knots), row-major
}

interface CacheEntry {
  grid: WindGridData;
  fetchedAt: number;
}

const cache = new Map<WindModel, CacheEntry>();

export async function fetchWindGrid(model: WindModel): Promise<WindGridData> {
  const cached = cache.get(model);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.grid;
  }

  const dlat = (GRID_BOUNDS.maxLat - GRID_BOUNDS.minLat) / (LAT_STEPS - 1);
  const dlng = (GRID_BOUNDS.maxLng - GRID_BOUNDS.minLng) / (LNG_STEPS - 1);

  // Build coordinate pair arrays — Open-Meteo pairs lat[i] with lng[i],
  // so we must send every grid cell as an explicit pair
  const lats: string[] = [];
  const lngs: string[] = [];
  for (let row = 0; row < LAT_STEPS; row++) {
    for (let col = 0; col < LNG_STEPS; col++) {
      lats.push((GRID_BOUNDS.minLat + row * dlat).toFixed(2));
      lngs.push((GRID_BOUNDS.minLng + col * dlng).toFixed(2));
    }
  }

  const url =
    `https://api.open-meteo.com/v1/forecast?` +
    `latitude=${lats.join(",")}&longitude=${lngs.join(",")}` +
    `&hourly=wind_speed_10m,wind_direction_10m` +
    `&models=${MODEL_PARAMS[model]}&forecast_hours=1`;

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Wind API error: ${response.status}`);

  const data = await response.json();

  const total = LAT_STEPS * LNG_STEPS;
  const u = new Float32Array(total);
  const v = new Float32Array(total);
  const speed = new Float32Array(total);

  // Response is an array of objects, one per coordinate pair
  const results = Array.isArray(data) ? data : [data];
  for (let i = 0; i < Math.min(total, results.length); i++) {
    const entry = results[i];
    if (!entry?.hourly) continue;

    const speedKmh = entry.hourly.wind_speed_10m?.[0] ?? 0;
    const dirDeg = entry.hourly.wind_direction_10m?.[0] ?? 0;

    // Convert km/h to m/s
    const speedMs = speedKmh / 3.6;
    // Meteorological direction (where wind comes FROM) to u/v
    const rad = (dirDeg * Math.PI) / 180;
    u[i] = -speedMs * Math.sin(rad);
    v[i] = -speedMs * Math.cos(rad);
    // Store speed in knots for color lookup
    speed[i] = speedKmh * 0.539957;
  }

  const grid: WindGridData = {
    bounds: { ...GRID_BOUNDS },
    latSteps: LAT_STEPS,
    lngSteps: LNG_STEPS,
    dlat,
    dlng,
    u,
    v,
    speed,
  };

  cache.set(model, { grid, fetchedAt: Date.now() });
  return grid;
}

export function blendBoatData(
  baseGrid: WindGridData,
  vesselsData: Record<string, VesselDataPoint>,
): WindGridData {
  // Clone arrays so we don't mutate the cached grid
  const u = new Float32Array(baseGrid.u);
  const v = new Float32Array(baseGrid.v);
  const speed = new Float32Array(baseGrid.speed);

  // Collect boats with valid wind data
  const boats: Array<{
    lat: number;
    lng: number;
    u: number;
    v: number;
    speedKnots: number;
  }> = [];

  for (const vessel of Object.values(vesselsData)) {
    if (
      !vessel.coords ||
      vessel.tws == null ||
      vessel.twa == null ||
      vessel.hdg == null
    )
      continue;

    const twsMs = vessel.tws / 1.944; // knots to m/s
    // True wind direction = heading + TWA
    const twdDeg = (vessel.hdg + vessel.twa + 360) % 360;
    const rad = (twdDeg * Math.PI) / 180;

    boats.push({
      lat: vessel.coords[1],
      lng: vessel.coords[0],
      u: -twsMs * Math.sin(rad),
      v: -twsMs * Math.cos(rad),
      speedKnots: vessel.tws,
    });
  }

  if (boats.length === 0) {
    return { ...baseGrid, u, v, speed };
  }

  const influenceRadius = 0.15; // ~15km in degrees
  const radiusSq = influenceRadius * influenceRadius;

  for (let row = 0; row < baseGrid.latSteps; row++) {
    for (let col = 0; col < baseGrid.lngSteps; col++) {
      const idx = row * baseGrid.lngSteps + col;
      const gridLat = baseGrid.bounds.minLat + row * baseGrid.dlat;
      const gridLng = baseGrid.bounds.minLng + col * baseGrid.dlng;

      let totalWeight = 0;
      let blendU = 0;
      let blendV = 0;
      let blendSpeed = 0;

      for (const boat of boats) {
        const dLat = gridLat - boat.lat;
        const dLng = gridLng - boat.lng;
        const distSq = dLat * dLat + dLng * dLng;

        if (distSq >= radiusSq || distSq < 1e-10) continue;

        const weight = 1 / distSq; // IDW with power=2
        totalWeight += weight;
        blendU += weight * boat.u;
        blendV += weight * boat.v;
        blendSpeed += weight * boat.speedKnots;
      }

      if (totalWeight > 0) {
        const boatU = blendU / totalWeight;
        const boatV = blendV / totalWeight;
        const boatSpeed = blendSpeed / totalWeight;

        const refWeight = 1 / (radiusSq * 0.25);
        const alpha = Math.min(totalWeight / (totalWeight + refWeight), 0.85);

        u[idx] = (1 - alpha) * u[idx] + alpha * boatU;
        v[idx] = (1 - alpha) * v[idx] + alpha * boatV;
        speed[idx] = (1 - alpha) * speed[idx] + alpha * boatSpeed;
      }
    }
  }

  return { ...baseGrid, u, v, speed };
}

export function interpolateWind(
  grid: WindGridData,
  lat: number,
  lng: number,
): { u: number; v: number; speed: number } | null {
  const { bounds, latSteps, lngSteps, dlat, dlng } = grid;

  const row = (lat - bounds.minLat) / dlat;
  const col = (lng - bounds.minLng) / dlng;

  if (row < 0 || row >= latSteps - 1 || col < 0 || col >= lngSteps - 1) {
    return null;
  }

  const r0 = Math.floor(row);
  const c0 = Math.floor(col);
  const fr = row - r0;
  const fc = col - c0;

  const i00 = r0 * lngSteps + c0;
  const i10 = i00 + 1;
  const i01 = i00 + lngSteps;
  const i11 = i01 + 1;

  const w00 = (1 - fr) * (1 - fc);
  const w10 = (1 - fr) * fc;
  const w01 = fr * (1 - fc);
  const w11 = fr * fc;

  return {
    u: grid.u[i00] * w00 + grid.u[i10] * w10 + grid.u[i01] * w01 + grid.u[i11] * w11,
    v: grid.v[i00] * w00 + grid.v[i10] * w10 + grid.v[i01] * w01 + grid.v[i11] * w11,
    speed:
      grid.speed[i00] * w00 +
      grid.speed[i10] * w10 +
      grid.speed[i01] * w01 +
      grid.speed[i11] * w11,
  };
}
