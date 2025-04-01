import { useEffect, useRef, useState, createElement } from "react";
import mapboxgl, { LngLatBounds, Map as MapboxMap, Marker } from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { VesselDataPoint } from "../types/tripData";
import { generateColorFromId } from "../utils/svgGenerator";
import BoatIcon from "./BoatIcon";
import { createRoot } from "react-dom/client";
import { Root } from "react-dom/client";

mapboxgl.accessToken =
  "pk.eyJ1IjoiaG9uemFzdHIiLCJhIjoiY2xnN3Zmc3RxMHJoODNtcDg4Zm1vZzVuMyJ9.m-gOOGzuPjmaSCfoJEy90g";

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

  useEffect(() => {
    if (!mapContainer.current) return;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/outdoors-v12",
      center: [15.5, 43.8],
      zoom: 9,
    });

    map.current.on("load", () => {
      setMapLoaded(true);
    });

    return () => {
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
        el.style.height = "24px";

        // Generate initial boat icon
        const root = createRoot(el);
        rootsRef.current[vesselId] = root;
        
        root.render(
          <BoatIcon 
            color={generateColorFromId(vesselId)} 
            width={24} 
            height={10} 
            rotation={0} 
          />
        );

        // Get vessel color for consistency
        const vesselColor = generateColorFromId(vesselId);

        // Add popup with vessel info and color
        const popup = new mapboxgl.Popup({
          closeButton: false,
          closeOnClick: false,
          offset: 25,
        })
          .setHTML(`<div style="border-left: 4px solid ${vesselColor}; padding-left: 6px;">
          <strong>Vessel ID: ${vesselId}</strong>
        </div>`);

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

    // Fit map to all bounds
    if (hasValidBounds) {
      map.current.fitBounds(allBounds, {
        padding: 50,
        maxZoom: 12,
      });
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
            color={generateColorFromId(vesselId)} 
            width={24} 
            height={10} 
            rotation={rotation} 
          />
        );
      }
    });
  }, [currentPointIndex, vesselsData]);

  return <div ref={mapContainer} className="map-container" />;
};

export default Map;
