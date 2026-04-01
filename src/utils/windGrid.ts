import { VesselDataPoint } from "../types/tripData";

export type WindModel = "icon_2i" | "ecmwf";

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

export interface WindGridBounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

export interface WindGridData {
  bounds: WindGridBounds;
  latSteps: number;
  lngSteps: number;
  dlat: number;
  dlng: number;
  u: Float32Array; // east-west component (m/s), row-major
  v: Float32Array; // north-south component (m/s), row-major
  speed: Float32Array; // magnitude (knots), row-major
}

/** A composite grid is an array of regional grids for one forecast hour. */
export type CompositeGrid = WindGridData[];

interface CacheEntry {
  hours: CompositeGrid[]; // index 0 = current hour, 1..3 = +1h..+3h forecast
  fetchedAt: number;
}

const cache = new Map<WindModel, CacheEntry>();

interface RegionResponse {
  bounds: WindGridBounds;
  latSteps: number;
  lngSteps: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  points: any[];
}

function parseRegionGrids(
  region: RegionResponse,
  forecastHours: number,
): WindGridData[] {
  const { bounds, latSteps, lngSteps, points } = region;
  const dlat = (bounds.maxLat - bounds.minLat) / (latSteps - 1);
  const dlng = (bounds.maxLng - bounds.minLng) / (lngSteps - 1);
  const total = latSteps * lngSteps;

  const grids: WindGridData[] = [];

  for (let h = 0; h < forecastHours; h++) {
    const u = new Float32Array(total);
    const v = new Float32Array(total);
    const speed = new Float32Array(total);

    for (let i = 0; i < Math.min(total, points.length); i++) {
      const entry = points[i];
      if (!entry?.hourly) continue;

      const speedKmh = entry.hourly.wind_speed_10m?.[h] ?? entry.hourly.wind_speed_10m?.[0] ?? 0;
      const dirDeg = entry.hourly.wind_direction_10m?.[h] ?? entry.hourly.wind_direction_10m?.[0] ?? 0;

      const speedMs = speedKmh / 3.6;
      const rad = (dirDeg * Math.PI) / 180;
      u[i] = -speedMs * Math.sin(rad);
      v[i] = -speedMs * Math.cos(rad);
      speed[i] = speedKmh * 0.539957;
    }

    grids.push({ bounds: { ...bounds }, latSteps, lngSteps, dlat, dlng, u, v, speed });
  }

  return grids;
}

export async function fetchWindGrid(model: WindModel): Promise<CompositeGrid> {
  const hours = await fetchWindGrids(model);
  return hours[0];
}

export async function fetchWindGrids(model: WindModel): Promise<CompositeGrid[]> {
  const cached = cache.get(model);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.hours;
  }

  const response = await fetch(`/api/wind/${model}`);
  if (!response.ok) throw new Error(`Wind API error: ${response.status}`);

  const regions: RegionResponse[] = await response.json();
  const forecastHours = 4;

  // Parse each region into per-hour grids, then group by hour
  const regionGrids = regions.map((r) => parseRegionGrids(r, forecastHours));
  // regionGrids[regionIdx][hourIdx] → WindGridData

  const hours: CompositeGrid[] = [];
  for (let h = 0; h < forecastHours; h++) {
    hours.push(regionGrids.map((rg) => rg[h]));
  }
  // hours[hourIdx][regionIdx] → WindGridData

  cache.set(model, { hours, fetchedAt: Date.now() });
  return hours;
}

/** Linearly interpolate between two composite grids. */
export function lerpGrids(a: CompositeGrid, b: CompositeGrid, t: number): CompositeGrid {
  const t1 = 1 - t;
  return a.map((aGrid, i) => {
    const bGrid = b[i];
    const total = aGrid.u.length;
    const u = new Float32Array(total);
    const v = new Float32Array(total);
    const speed = new Float32Array(total);

    for (let j = 0; j < total; j++) {
      u[j] = t1 * aGrid.u[j] + t * bGrid.u[j];
      v[j] = t1 * aGrid.v[j] + t * bGrid.v[j];
      speed[j] = t1 * aGrid.speed[j] + t * bGrid.speed[j];
    }

    return { ...aGrid, u, v, speed };
  });
}

export function blendBoatData(
  composite: CompositeGrid,
  vesselsData: Record<string, VesselDataPoint>,
): CompositeGrid {
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

    const twsMs = vessel.tws / 1.944;
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

  if (boats.length === 0) return composite;

  const influenceRadius = 0.15;
  const radiusSq = influenceRadius * influenceRadius;

  return composite.map((baseGrid) => {
    const u = new Float32Array(baseGrid.u);
    const v = new Float32Array(baseGrid.v);
    const speed = new Float32Array(baseGrid.speed);

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

          const weight = 1 / distSq;
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
  });
}

function interpolateWindSingle(
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

/** Interpolate wind at a point, trying each region in the composite grid. */
export function interpolateWind(
  composite: CompositeGrid,
  lat: number,
  lng: number,
): { u: number; v: number; speed: number } | null {
  for (const grid of composite) {
    const result = interpolateWindSingle(grid, lat, lng);
    if (result) return result;
  }
  return null;
}
