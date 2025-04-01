import { useEffect, useRef, useState } from "react";
import mapboxgl, { LngLatBounds, Map as MapboxMap, Marker } from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { VesselDataPoint } from "../types/tripData";
import { generateSailboatSvg, generateColorFromId } from "../utils/svgGenerator";

mapboxgl.accessToken =
  "pk.eyJ1IjoiaG9uemFzdHIiLCJhIjoiY2xnN3Zmc3RxMHJoODNtcDg4Zm1vZzVuMyJ9.m-gOOGzuPjmaSCfoJEy90g";

interface LiveMapProps {
  vesselsData: Record<string, VesselDataPoint>;
}

const LiveMap = ({ vesselsData }: LiveMapProps) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<MapboxMap | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const markersRef = useRef<Record<string, Marker>>({});

  // Initialize map on component mount
  useEffect(() => {
    if (!mapContainer.current) return;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/outdoors-v12", // Using outdoors style for nautical context
      center: [15.5, 43.8], // Initial center position (will be adjusted based on data)
      zoom: 9,
    });

    map.current.on("load", () => {
      setMapLoaded(true);
    });

    return () => {
      map.current?.remove();
    };
  }, []);

  // Update markers based on live data
  useEffect(() => {
    if (!mapLoaded || !map.current) return;
    
    // Calculate bounds to fit all vessels
    let allBounds = new LngLatBounds();
    let hasValidBounds = false;

    // Track which vessels are currently shown
    const currentVesselIds = new Set(Object.keys(vesselsData));
    const existingVesselIds = new Set(Object.keys(markersRef.current));

    // Process each vessel from live data
    Object.entries(vesselsData).forEach(([vesselId, data]) => {
      if (!data.coords) return; // Skip if no coords

      // Add to bounds
      if (!hasValidBounds) {
        allBounds = new LngLatBounds(
          data.coords as [number, number], 
          data.coords as [number, number]
        );
        hasValidBounds = true;
      } else {
        allBounds.extend(data.coords as [number, number]);
      }

      // Update or create marker
      if (markersRef.current[vesselId]) {
        // Update existing marker
        const marker = markersRef.current[vesselId];
        marker.setLngLat(data.coords as [number, number]);

        // Update rotation
        const rotation = data.hdg || data.cog || 0;
        const el = marker.getElement();
        const svg = generateSailboatSvg(vesselId, rotation);
        el.innerHTML = svg;
      } else {
        // Create new marker
        const el = document.createElement('div');
        el.className = 'vessel-marker';
        el.style.width = '24px';
        el.style.height = '24px';
        
        // Generate initial SVG
        const rotation = data.hdg || data.cog || 0;
        const svg = generateSailboatSvg(vesselId, rotation);
        el.innerHTML = svg;
        
        // Get vessel color for consistency
        const vesselColor = generateColorFromId(vesselId);
        
        // Add popup with vessel info and color
        const popup = new mapboxgl.Popup({
          closeButton: false,
          closeOnClick: false,
          offset: 25
        }).setHTML(`<div style="border-left: 4px solid ${vesselColor}; padding-left: 6px;">
          <strong>Vessel ID: ${vesselId}</strong>
          <br>
          <span>Speed: ${data.sog?.toFixed(1) || '?'} knots</span>
        </div>`);
        
        // Create the marker
        const marker = new mapboxgl.Marker({
          element: el,
          anchor: 'center',
          rotationAlignment: 'map'
        })
          .setLngLat(data.coords as [number, number])
          .setPopup(popup)
          .addTo(map.current!);
        
        markersRef.current[vesselId] = marker;
      }
    });

    // Remove markers for vessels not in the current data
    existingVesselIds.forEach(id => {
      if (!currentVesselIds.has(id)) {
        markersRef.current[id].remove();
        delete markersRef.current[id];
      }
    });

    // Fit map to all bounds on first load with data
    if (hasValidBounds && Object.keys(markersRef.current).length > 0 && Object.keys(markersRef.current).length !== existingVesselIds.size) {
      map.current.fitBounds(allBounds, {
        padding: 50,
        maxZoom: 12,
      });
    }
  }, [mapLoaded, vesselsData]);

  return <div ref={mapContainer} className="map-container" />;
};

export default LiveMap;