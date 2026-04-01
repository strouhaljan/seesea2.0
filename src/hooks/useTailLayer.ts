import { useEffect, MutableRefObject } from "react";
import mapboxgl, { Map as MapboxMap } from "mapbox-gl";
import { TailsData } from "./useTails";
import { Crew } from "./useEventConfig";
import { ColorMode } from "../types/map";
import { getColorBySpeed } from "../utils/wind";

const TAIL_LINE_SOURCE = "tail-lines";
const TAIL_LINE_LAYER = "tail-lines-layer";

interface UseTailLayerOptions {
  tails: TailsData;
  trailMinutes: number;
  isHistoryMode: boolean;
  crews: Crew[];
  highlightedCrews: Set<number>;
  showOnlyHighlighted: boolean;
  colorMode: ColorMode;
}

export function useTailLayer(
  map: MutableRefObject<MapboxMap | null>,
  mapLoaded: boolean,
  options: UseTailLayerOptions,
) {
  const { tails, trailMinutes, isHistoryMode, crews, highlightedCrews, showOnlyHighlighted, colorMode } = options;

  useEffect(() => {
    if (!mapLoaded || !map.current) return;

    const tailFeatures: GeoJSON.Feature<GeoJSON.LineString>[] = [];

    if (trailMinutes > 0 && Object.keys(tails).length > 0) {
      const cutoff = isHistoryMode ? 0 : Date.now() / 1000 - trailMinutes * 60;
      Object.entries(tails).forEach(([vesselId, points]) => {
        const isHighlighted = highlightedCrews.has(parseInt(vesselId));
        const shouldShow = !showOnlyHighlighted || isHighlighted;
        if (!shouldShow) return;

        const filtered = points.filter((p) => p[0] >= cutoff);
        if (filtered.length < 2) return;

        const crew = crews.find((c) => c.id === parseInt(vesselId));
        const crewColor = crew?.track_color || "#888";

        const useWindColors = colorMode === "wind";
        const hasWindData = useWindColors && filtered.some((p) => p[3] !== undefined);

        if (hasWindData) {
          // Create per-segment features colored by wind speed
          for (let i = 0; i < filtered.length - 1; i++) {
            const p1 = filtered[i];
            const p2 = filtered[i + 1];
            const windSpeed = p1[3];
            tailFeatures.push({
              type: "Feature",
              properties: { color: getColorBySpeed(windSpeed) },
              geometry: {
                type: "LineString",
                coordinates: [[p1[1], p1[2]], [p2[1], p2[2]]],
              },
            });
          }
        } else {
          // Single LineString with crew color
          const coords: [number, number][] = filtered.map((p) => [p[1], p[2]]);
          tailFeatures.push({
            type: "Feature",
            properties: { color: crewColor },
            geometry: { type: "LineString", coordinates: coords },
          });
        }
      });
    }

    const tailGeojson: GeoJSON.FeatureCollection<GeoJSON.LineString> = {
      type: "FeatureCollection",
      features: tailFeatures,
    };
    const existingSource = map.current.getSource(TAIL_LINE_SOURCE) as mapboxgl.GeoJSONSource | undefined;
    if (existingSource) {
      existingSource.setData(tailGeojson);
    } else {
      map.current.addSource(TAIL_LINE_SOURCE, { type: "geojson", data: tailGeojson });
      map.current.addLayer({
        id: TAIL_LINE_LAYER,
        type: "line",
        source: TAIL_LINE_SOURCE,
        paint: {
          "line-color": ["get", "color"],
          "line-width": 2,
          "line-opacity": 0.7,
        },
      });
    }
  }, [mapLoaded, tails, trailMinutes, isHistoryMode, crews, highlightedCrews, showOnlyHighlighted, colorMode]);
}
