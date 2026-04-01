import { useEffect, MutableRefObject } from "react";
import mapboxgl, { Map as MapboxMap } from "mapbox-gl";
import { LegMarker } from "./useLegMarkers";

const LEG_LINE_SOURCE = "leg-lines";
const LEG_LINE_LAYER = "leg-lines-layer";
const LEG_POINT_SOURCE = "leg-points";
const LEG_POINT_LAYER = "leg-points-layer";
const LEG_LABEL_LAYER = "leg-labels-layer";

const LEG_MARKER_COLORS: Record<string, string> = {
  start: "#00cc44",
  finish: "#cc0000",
  line: "#ff8800",
  buoy: "#ffcc00",
  dtf: "#8888ff",
};

export function useLegLayer(
  map: MutableRefObject<MapboxMap | null>,
  mapLoaded: boolean,
  legMarkers: LegMarker[],
) {
  useEffect(() => {
    if (!mapLoaded || !map.current) return;

    const legLineFeatures: GeoJSON.Feature<GeoJSON.LineString>[] = [];
    const legPointFeatures: GeoJSON.Feature<GeoJSON.Point>[] = [];

    for (const m of legMarkers) {
      const color = LEG_MARKER_COLORS[m.marker_type] || "#ffffff";

      if (m.lat_2 != null && m.lon_2 != null) {
        legLineFeatures.push({
          type: "Feature",
          properties: { color, name: m.name, marker_type: m.marker_type },
          geometry: {
            type: "LineString",
            coordinates: [[m.lon, m.lat], [m.lon_2, m.lat_2]],
          },
        });
      } else {
        legPointFeatures.push({
          type: "Feature",
          properties: { color, name: m.name, marker_type: m.marker_type },
          geometry: {
            type: "Point",
            coordinates: [m.lon, m.lat],
          },
        });
      }
    }

    const legLineData: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: legLineFeatures };
    const legPointData: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: legPointFeatures };

    const existingLegLineSource = map.current.getSource(LEG_LINE_SOURCE) as mapboxgl.GeoJSONSource | undefined;
    if (existingLegLineSource) {
      existingLegLineSource.setData(legLineData);
    } else {
      map.current.addSource(LEG_LINE_SOURCE, { type: "geojson", data: legLineData });
      map.current.addLayer({
        id: LEG_LINE_LAYER,
        type: "line",
        source: LEG_LINE_SOURCE,
        paint: {
          "line-color": ["get", "color"],
          "line-width": 3,
          "line-opacity": 0.9,
        },
      });
    }

    const existingLegPointSource = map.current.getSource(LEG_POINT_SOURCE) as mapboxgl.GeoJSONSource | undefined;
    if (existingLegPointSource) {
      existingLegPointSource.setData(legPointData);
    } else {
      map.current.addSource(LEG_POINT_SOURCE, { type: "geojson", data: legPointData });
      map.current.addLayer({
        id: LEG_POINT_LAYER,
        type: "circle",
        source: LEG_POINT_SOURCE,
        paint: {
          "circle-radius": 6,
          "circle-color": ["get", "color"],
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });
      map.current.addLayer({
        id: LEG_LABEL_LAYER,
        type: "symbol",
        source: LEG_POINT_SOURCE,
        layout: {
          "text-field": ["get", "name"],
          "text-size": 12,
          "text-offset": [0, 1.5],
          "text-anchor": "top",
        },
        paint: {
          "text-color": "#ffffff",
          "text-halo-color": "#000000",
          "text-halo-width": 1,
        },
      });
    }
  }, [mapLoaded, legMarkers]);
}
