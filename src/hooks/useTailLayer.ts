import { useEffect, MutableRefObject } from "react";
import mapboxgl, { Map as MapboxMap } from "mapbox-gl";
import { TailsData } from "./useTails";
import { Crew } from "./useEventConfig";

const TAIL_LINE_SOURCE = "tail-lines";
const TAIL_LINE_LAYER = "tail-lines-layer";

interface UseTailLayerOptions {
  tails: TailsData;
  trailMinutes: number;
  isHistoryMode: boolean;
  crews: Crew[];
  highlightedCrews: Set<number>;
  showOnlyHighlighted: boolean;
}

export function useTailLayer(
  map: MutableRefObject<MapboxMap | null>,
  mapLoaded: boolean,
  options: UseTailLayerOptions,
) {
  const { tails, trailMinutes, isHistoryMode, crews, highlightedCrews, showOnlyHighlighted } = options;

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
        const coords: [number, number][] = filtered.map((p) => [p[1], p[2]]);

        tailFeatures.push({
          type: "Feature",
          properties: { color: crew?.track_color || "#888" },
          geometry: { type: "LineString", coordinates: coords },
        });
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
  }, [mapLoaded, tails, trailMinutes, isHistoryMode, crews, highlightedCrews, showOnlyHighlighted]);
}
