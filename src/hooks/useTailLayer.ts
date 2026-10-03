import { useEffect, useRef, MutableRefObject } from "react";
import mapboxgl, { Map as MapboxMap } from "mapbox-gl";
import { TailsData } from "./useTails";
import { Crew } from "./useEventConfig";
import { ColorMode } from "../types/map";
import { getColorBySpeed } from "../utils/wind";
import { now as raceNow } from "../utils/clock";

const TAIL_LINE_SOURCE = "tail-lines";
const TAIL_LINE_LAYER = "tail-lines-layer";
const WIND_PREFIX = "tail-wind-";
const WIND_LAYER_PREFIX = "tail-wind-layer-";

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
  const activeWindIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!mapLoaded || !map.current) return;
    const m = map.current;

    const tailFeatures: GeoJSON.Feature<GeoJSON.LineString>[] = [];
    const nextWindIds = new Set<string>();

    if (trailMinutes > 0 && Object.keys(tails).length > 0) {
      const cutoff = isHistoryMode ? 0 : raceNow() / 1000 - trailMinutes * 60;
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
          // Per-vessel source+layer with line-gradient for a true smooth gradient
          const sourceId = WIND_PREFIX + vesselId;
          const layerId = WIND_LAYER_PREFIX + vesselId;
          nextWindIds.add(vesselId);

          const coords: [number, number][] = filtered.map((p) => [p[1], p[2]]);
          const geojson: GeoJSON.FeatureCollection<GeoJSON.LineString> = {
            type: "FeatureCollection",
            features: [{
              type: "Feature",
              properties: {},
              geometry: { type: "LineString", coordinates: coords },
            }],
          };

          // Build gradient stops: [progress, color, progress, color, ...]
          const gradientStops: (number | string)[] = [];
          for (let i = 0; i < filtered.length; i++) {
            const progress = filtered.length > 1 ? i / (filtered.length - 1) : 0;
            gradientStops.push(progress, getColorBySpeed(filtered[i][3]));
          }

          const existingSource = m.getSource(sourceId) as mapboxgl.GeoJSONSource | undefined;
          if (existingSource) {
            existingSource.setData(geojson);
            m.setPaintProperty(layerId, "line-gradient", [
              "interpolate", ["linear"], ["line-progress"],
              ...gradientStops,
            ]);
          } else {
            m.addSource(sourceId, { type: "geojson", data: geojson, lineMetrics: true });
            m.addLayer({
              id: layerId,
              type: "line",
              source: sourceId,
              paint: {
                "line-gradient": [
                  "interpolate", ["linear"], ["line-progress"],
                  ...gradientStops,
                ],
                "line-width": 2,
                "line-opacity": 0.7,
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

    // Remove wind sources/layers for vessels no longer shown
    for (const oldId of activeWindIds.current) {
      if (!nextWindIds.has(oldId)) {
        const layerId = WIND_LAYER_PREFIX + oldId;
        const sourceId = WIND_PREFIX + oldId;
        if (m.getLayer(layerId)) m.removeLayer(layerId);
        if (m.getSource(sourceId)) m.removeSource(sourceId);
      }
    }
    activeWindIds.current = nextWindIds;

    // Update the shared source/layer for non-wind trails
    const tailGeojson: GeoJSON.FeatureCollection<GeoJSON.LineString> = {
      type: "FeatureCollection",
      features: tailFeatures,
    };
    const existingSource = m.getSource(TAIL_LINE_SOURCE) as mapboxgl.GeoJSONSource | undefined;
    if (existingSource) {
      existingSource.setData(tailGeojson);
    } else {
      m.addSource(TAIL_LINE_SOURCE, { type: "geojson", data: tailGeojson });
      m.addLayer({
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
