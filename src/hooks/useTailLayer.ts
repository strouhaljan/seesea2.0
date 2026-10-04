import { useEffect, MutableRefObject } from "react";
import mapboxgl, { Map as MapboxMap } from "mapbox-gl";
import { TailsData } from "./useTails";
import { Crew } from "./useEventConfig";
import { ColorMode } from "../types/map";
import { WIND_SPEED_COLORS } from "../utils/wind";
import { now as raceNow } from "../utils/clock";

const TAIL_LINE_SOURCE = "tail-lines";
const TAIL_LINE_LAYER = "tail-lines-layer";

/** Same scale as getColorBySpeed, evaluated by Mapbox per segment. */
const WIND_COLOR: mapboxgl.Expression = [
  "case",
  ["has", "tws"],
  ["interpolate", ["linear"], ["get", "tws"], ...WIND_SPEED_COLORS.flatMap((s) => [s.threshold, s.color])],
  ["get", "color"], // vessel without wind data: crew colour, as before
];
const CREW_COLOR: mapboxgl.Expression = ["get", "color"];

interface UseTailLayerOptions {
  tails: TailsData;
  trailMinutes: number;
  isHistoryMode: boolean;
  crews: Crew[];
  highlightedCrews: Set<number>;
  showOnlyHighlighted: boolean;
  colorMode: ColorMode;
}

/**
 * All trails live in one source/layer, split into one segment per pair of
 * consecutive points so each segment can carry its own wind speed. A source
 * per boat (needed for line-gradient) made every update and every marker move
 * scale with the number of boats.
 */
export function useTailLayer(
  map: MutableRefObject<MapboxMap | null>,
  mapLoaded: boolean,
  options: UseTailLayerOptions,
) {
  const { tails, trailMinutes, isHistoryMode, crews, highlightedCrews, showOnlyHighlighted, colorMode } = options;

  useEffect(() => {
    if (!mapLoaded || !map.current) return;
    const m = map.current;

    const features: GeoJSON.Feature<GeoJSON.LineString>[] = [];

    if (trailMinutes > 0 && Object.keys(tails).length > 0) {
      const cutoff = isHistoryMode ? 0 : raceNow() / 1000 - trailMinutes * 60;
      Object.entries(tails).forEach(([vesselId, points]) => {
        const isHighlighted = highlightedCrews.has(parseInt(vesselId));
        const shouldShow = !showOnlyHighlighted || isHighlighted;
        if (!shouldShow) return;

        const filtered = points.filter((p) => p[0] >= cutoff);
        if (filtered.length < 2) return;

        const crew = crews.find((c) => c.id === parseInt(vesselId));
        const color = crew?.track_color || "#888";
        const hasWindData = filtered.some((p) => p[3] !== undefined);

        for (let i = 0; i < filtered.length - 1; i++) {
          const a = filtered[i];
          const b = filtered[i + 1];
          features.push({
            type: "Feature",
            // Missing readings count as 0 kn, like getColorBySpeed(undefined)
            properties: hasWindData ? { color, tws: ((a[3] ?? 0) + (b[3] ?? 0)) / 2 } : { color },
            geometry: { type: "LineString", coordinates: [[a[1], a[2]], [b[1], b[2]]] },
          });
        }
      });
    }

    const data: GeoJSON.FeatureCollection<GeoJSON.LineString> = { type: "FeatureCollection", features };
    const lineColor = colorMode === "wind" ? WIND_COLOR : CREW_COLOR;

    const existingSource = m.getSource(TAIL_LINE_SOURCE) as mapboxgl.GeoJSONSource | undefined;
    if (existingSource) {
      existingSource.setData(data);
      m.setPaintProperty(TAIL_LINE_LAYER, "line-color", lineColor);
    } else {
      m.addSource(TAIL_LINE_SOURCE, { type: "geojson", data });
      m.addLayer({
        id: TAIL_LINE_LAYER,
        type: "line",
        source: TAIL_LINE_SOURCE,
        paint: {
          "line-color": lineColor,
          "line-width": 2,
          "line-opacity": 0.7,
        },
      });
    }
  }, [mapLoaded, tails, trailMinutes, isHistoryMode, crews, highlightedCrews, showOnlyHighlighted, colorMode]);
}
