import type { WindModel, WindRegion } from "./types.js";

export const MODEL_PARAMS: Record<WindModel, string> = {
  icon_2i: "italia_meteo_arpae_icon_2i",
  ecmwf: "ecmwf_ifs025",
};

export const WIND_MODELS = Object.keys(MODEL_PARAMS) as WindModel[];

// Three coastal rectangles following the Dubrovnik–Murter race corridor
export const REGIONS: WindRegion[] = [
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
  {
    name: "palagruza", // Open sea from Murter/Šibenik down to Palagruža
    minLat: 42.3, maxLat: 43.4,
    minLng: 15.4, maxLng: 16.5,
    latSteps: 8, lngSteps: 12,
  },
];

/** Row-major grid point coordinates as an Open-Meteo `latitude=…&longitude=…` query. */
export function gridQuery(region: WindRegion): string {
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

  return `latitude=${lats.join(",")}&longitude=${lngs.join(",")}`;
}
