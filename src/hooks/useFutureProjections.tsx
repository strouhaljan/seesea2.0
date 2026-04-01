import { useEffect, useRef, MutableRefObject } from "react";
import mapboxgl, { Map as MapboxMap, Marker } from "mapbox-gl";
import { createRoot, Root } from "react-dom/client";
import { VesselDataPoint } from "../types/tripData";
import { ColorMode } from "../types/map";
import { futurePosition } from "../utils/futurePosition";
import BoatIcon from "../components/BoatIcon";
import { Crew } from "../hooks/useEventConfig";

const FUTURE_LINE_SOURCE = "future-position-lines";
const FUTURE_LINE_LAYER = "future-position-lines-layer";

interface UseFutureProjectionsOptions {
  vesselsData: Record<string, VesselDataPoint>;
  futureMinutes: number;
  isHistoryMode: boolean;
  crews: Crew[];
  highlightedCrews: Set<number>;
  showOnlyHighlighted: boolean;
  colorMode: ColorMode;
}

export function useFutureProjections(
  map: MutableRefObject<MapboxMap | null>,
  mapLoaded: boolean,
  options: UseFutureProjectionsOptions,
) {
  const { vesselsData, futureMinutes, isHistoryMode, crews, highlightedCrews, showOnlyHighlighted, colorMode } = options;
  const futureMarkersRef = useRef<Record<string, Marker>>({});
  const futureRootsRef = useRef<Record<string, Root>>({});

  useEffect(() => {
    if (!mapLoaded || !map.current) return;

    // Clean up existing future markers
    Object.values(futureMarkersRef.current).forEach((m) => m.remove());
    Object.values(futureRootsRef.current).forEach((r) => {
      try { r.unmount(); } catch (_) { /* ignore */ }
    });
    futureMarkersRef.current = {};
    futureRootsRef.current = {};

    const lineFeatures: GeoJSON.Feature<GeoJSON.LineString>[] = [];

    if (futureMinutes > 0 && !isHistoryMode) {
      Object.entries(vesselsData).forEach(([vesselId, data]) => {
        if (!data.coords || !data.sog || data.sog <= 0) return;
        const cog = data.cog || data.hdg || 0;
        if (!cog) return;

        const isHighlighted = highlightedCrews.has(parseInt(vesselId));
        const shouldShow = !showOnlyHighlighted || isHighlighted;
        if (!shouldShow) return;

        const crew = crews.find((c) => c.id === parseInt(vesselId));
        const coords = data.coords as [number, number];
        const futureCoords = futurePosition(coords, data.sog, cog, futureMinutes);

        lineFeatures.push({
          type: "Feature",
          properties: { color: crew?.track_color || "#888" },
          geometry: { type: "LineString", coordinates: [coords, futureCoords] },
        });

        const el = document.createElement("div");
        el.className = "vessel-marker vessel-marker--future";
        el.style.width = "36px";
        el.style.height = "50px";
        el.style.pointerEvents = "none";

        const root = createRoot(el);
        futureRootsRef.current[vesselId] = root;
        root.render(
          <BoatIcon
            color={crew?.track_color}
            colorMode={colorMode}
            rotation={data.hdg || data.cog || 0}
            opacity={0.5}
            label={`${futureMinutes}m`}
          />,
        );

        const marker = new mapboxgl.Marker({
          element: el,
          anchor: "center",
          rotationAlignment: "map",
        })
          .setLngLat(futureCoords)
          .addTo(map.current!);

        futureMarkersRef.current[vesselId] = marker;
      });
    }

    const geojsonData: GeoJSON.FeatureCollection<GeoJSON.LineString> = {
      type: "FeatureCollection",
      features: lineFeatures,
    };
    const existingSource = map.current.getSource(FUTURE_LINE_SOURCE) as mapboxgl.GeoJSONSource | undefined;
    if (existingSource) {
      existingSource.setData(geojsonData);
    } else {
      map.current.addSource(FUTURE_LINE_SOURCE, { type: "geojson", data: geojsonData });
      map.current.addLayer({
        id: FUTURE_LINE_LAYER,
        type: "line",
        source: FUTURE_LINE_SOURCE,
        paint: {
          "line-color": ["get", "color"],
          "line-width": 2,
          "line-dasharray": [4, 4],
          "line-opacity": 0.6,
        },
      });
    }
  }, [mapLoaded, vesselsData, futureMinutes, isHistoryMode, crews, highlightedCrews, showOnlyHighlighted, colorMode]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      Object.values(futureRootsRef.current).forEach((r) => {
        try { r.unmount(); } catch (_) { /* ignore */ }
      });
    };
  }, []);
}
