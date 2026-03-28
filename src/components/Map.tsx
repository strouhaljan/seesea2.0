import { useEffect, useRef, useState } from "react";
import mapboxgl, { LngLatBounds, Map as MapboxMap, Marker } from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { VesselDataPoint } from "../types/tripData";
import { generateColorFromId } from "../utils/svgGenerator";
import { generateVesselPopupHTML } from "../utils/popupContent";
import { MAP_STYLE, DEFAULT_CENTER, getSavedZoom, saveZoom, CENTER_VESSEL_ID } from "../utils/mapConfig";
import BoatIcon from "./BoatIcon";
import { createRoot } from "react-dom/client";
import { Root } from "react-dom/client";
import { useEventConfig } from "../hooks/useEventConfig";

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

interface MapProps {
  vesselsData: Record<string, VesselDataPoint[]>;
  currentPointIndex: number;
}

const Map = ({ vesselsData, currentPointIndex }: MapProps) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<MapboxMap | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const markersRef = useRef<Record<string, Marker>>({});
  const rootsRef = useRef<Record<string, Root>>({});
  const routeLinesRef = useRef<string[]>([]);
  const popupsRef = useRef<Record<string, mapboxgl.Popup>>({});
  const { highlightedCrews, toggleHighlight } = useEventConfig();
  const toggleHighlightRef = useRef(toggleHighlight);
  toggleHighlightRef.current = toggleHighlight;

  useEffect(() => {
    if (!mapContainer.current) return;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: MAP_STYLE,
      center: DEFAULT_CENTER,
      zoom: getSavedZoom(),
    });

    map.current.on("load", () => {
      setMapLoaded(true);
    });

    map.current.on("zoomend", () => {
      if (map.current) saveZoom(map.current.getZoom());
    });

    const handlePopupClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains("highlight-toggle")) {
        const vesselId = target.dataset.vesselId;
        if (vesselId) {
          toggleHighlightRef.current(parseInt(vesselId));
        }
      }
    };
    mapContainer.current.addEventListener("click", handlePopupClick);

    const container = mapContainer.current;
    return () => {
      container.removeEventListener("click", handlePopupClick);
      map.current?.remove();
    };
  }, []);

  useEffect(() => {
    if (!mapLoaded || !map.current || Object.keys(vesselsData).length === 0)
      return;

    // Calculate bounds to fit all coordinates from all vessels
    let allBounds = new LngLatBounds();
    let hasValidBounds = false;

    Object.entries(vesselsData).forEach(([vesselId, trackData]) => {
      if (trackData.length > 0) {
        // Initialize bounds with first point if this is the first valid vessel
        if (!hasValidBounds) {
          allBounds = new LngLatBounds(
            trackData[0].coords as [number, number],
            trackData[0].coords as [number, number],
          );
          hasValidBounds = true;
        }

        // Extend bounds with all points from this vessel
        trackData.forEach((point) => {
          allBounds.extend(point.coords as [number, number]);
        });
      }
    });

    // Process each vessel
    Object.entries(vesselsData).forEach(([vesselId, trackData]) => {
      if (trackData.length === 0) return;

      // Create GeoJSON data for route line
      const routeData = {
        type: "Feature",
        properties: { vesselId },
        geometry: {
          type: "LineString",
          coordinates: trackData.map((point) => point.coords),
        },
      };

      // Add route line source and layer if not already added
      const routeSourceId = `route-${vesselId}`;
      const routeLayerId = `route-line-${vesselId}`;

      if (!map.current!.getSource(routeSourceId)) {
        map.current!.addSource(routeSourceId, {
          type: "geojson",
          data: routeData as any,
        });

        // Get the same color as used for the vessel marker
        const routeColor = generateColorFromId(vesselId);

        map.current!.addLayer({
          id: routeLayerId,
          type: "line",
          source: routeSourceId,
          layout: {
            "line-join": "round",
            "line-cap": "round",
          },
          paint: {
            "line-color": routeColor,
            "line-opacity": 0.1,
            "line-width": 2.5,
          },
        });

        routeLinesRef.current.push(routeLayerId);
      }

      // Create vessel marker if not already created
      if (!markersRef.current[vesselId]) {
        const el = document.createElement("div");
        el.className = "vessel-marker";
        el.style.width = "24px";
        el.style.height = "35px";

        // Generate initial boat icon
        const root = createRoot(el);
        rootsRef.current[vesselId] = root;

        root.render(
          <BoatIcon
            highlight={highlightedCrews.has(parseInt(vesselId))}

            rotation={0}
          />,
        );

        // Get vessel color for consistency
        const vesselColor = generateColorFromId(vesselId);

        // Create popup and store it in the ref
        const popup = new mapboxgl.Popup({
          closeButton: false,
          closeOnClick: true,
          offset: 25,
        });

        popupsRef.current[vesselId] = popup;

        // Close all other popups when this one opens
        popup.on("open", () => {
          Object.entries(popupsRef.current).forEach(([id, p]) => {
            if (id !== vesselId && p.isOpen()) p.remove();
          });
        });

        // Initial popup content including wind data if available
        const firstPoint = trackData[0];
        const initialPopupContent = generateVesselPopupHTML(
          vesselId,
          firstPoint,
          vesselColor,
        );
        popup.setHTML(initialPopupContent);

        // Create the marker
        const marker = new mapboxgl.Marker({
          element: el,
          anchor: "center",
          rotationAlignment: "map",
        })
          .setLngLat(trackData[0].coords as [number, number])
          .setPopup(popup)
          .addTo(map.current!);

        markersRef.current[vesselId] = marker;
      }
    });

    // Center on target vessel, or fit all bounds as fallback
    const targetTrack = vesselsData[CENTER_VESSEL_ID];
    if (targetTrack && targetTrack.length > 0) {
      map.current.setCenter(targetTrack[0].coords as [number, number]);
    } else if (hasValidBounds) {
      map.current.fitBounds(allBounds, { padding: 50, maxZoom: 12 });
    }
  }, [mapLoaded, vesselsData]);

  // Update all vessel markers when currentPointIndex changes
  useEffect(() => {
    if (!map.current) return;

    Object.entries(vesselsData).forEach(([vesselId, trackData]) => {
      const marker = markersRef.current[vesselId];
      if (!marker || currentPointIndex >= trackData.length) return;

      const currentPoint = trackData[currentPointIndex];
      if (currentPoint) {
        // Set marker position
        marker.setLngLat(currentPoint.coords as [number, number]);

        // Get rotation (heading or course)
        const rotation = currentPoint.hdg || currentPoint.cog || 0;

        // Update marker with rotated boat icon
        const el = marker.getElement();

        if (!rootsRef.current[vesselId]) {
          rootsRef.current[vesselId] = createRoot(el);
        }

        rootsRef.current[vesselId].render(
          <BoatIcon
            highlight={highlightedCrews.has(parseInt(vesselId))}

            rotation={rotation}
            windDirection={currentPoint.twa}
            windSpeed={currentPoint.tws}
            showWindArrow={
              currentPoint.twa !== undefined &&
              currentPoint.tws !== undefined &&
              currentPoint.tws > 0
            }
          />,
        );

        // Update popup content with all available data
        const popup = popupsRef.current[vesselId];
        if (popup) {
          const vesselColor = generateColorFromId(vesselId);
          const popupContent = generateVesselPopupHTML(
            vesselId,
            currentPoint,
            vesselColor,
          );
          popup.setHTML(popupContent);
        }
      }
    });
  }, [currentPointIndex, vesselsData, highlightedCrews]);

  return <div ref={mapContainer} className="map-container" />;
};

export default Map;
