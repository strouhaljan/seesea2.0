import { useEffect, useRef, useState } from "react";
import mapboxgl, { LngLatBounds, Map as MapboxMap, Marker } from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { VesselDataPoint } from "../types/tripData";

mapboxgl.accessToken =
  "pk.eyJ1IjoiaG9uemFzdHIiLCJhIjoiY2xnN3Zmc3RxMHJoODNtcDg4Zm1vZzVuMyJ9.m-gOOGzuPjmaSCfoJEy90g";

interface MapProps {
  vesselTrackData: VesselDataPoint[];
  currentPointIndex: number;
}

const Map = ({ vesselTrackData, currentPointIndex }: MapProps) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<MapboxMap | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const currentMarkerRef = useRef<Marker | null>(null);

  // Initialize map on component mount
  useEffect(() => {
    if (!mapContainer.current) return;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/outdoors-v12", // Using outdoors style for nautical context
      center: [15.5, 43.8], // Initial center position (will be adjusted based on data)
      zoom: 12,
    });

    map.current.on("load", () => {
      setMapLoaded(true);
    });

    return () => {
      map.current?.remove();
    };
  }, []);

  // Add route data to map once it's loaded
  useEffect(() => {
    if (!mapLoaded || !map.current || !vesselTrackData.length) return;

    // Create GeoJSON data for route line
    const routeData = {
      type: "Feature",
      properties: {},
      geometry: {
        type: "LineString",
        coordinates: vesselTrackData.map((point) => point.coords),
      },
    };

    // Calculate bounds to fit all coordinates
    const bounds = vesselTrackData.reduce((bounds, point) => {
      return bounds.extend(point.coords as [number, number]);
    }, new LngLatBounds(vesselTrackData[0].coords, vesselTrackData[0].coords));

    // Add route line source and layer
    if (!map.current.getSource("route")) {
      map.current.addSource("route", {
        type: "geojson",
        data: routeData as any,
      });

      map.current.addLayer({
        id: "route",
        type: "line",
        source: "route",
        layout: {
          "line-join": "round",
          "line-cap": "round",
        },
        paint: {
          "line-color": "#0077cc",
          "line-width": 4,
        },
      });

      // Add start and end points
      const startPoint = vesselTrackData[0];
      const endPoint = vesselTrackData[vesselTrackData.length - 1];

      // Add start marker
      new mapboxgl.Marker({ color: "#00cc00" })
        .setLngLat(startPoint.coords as [number, number])
        .setPopup(
          new mapboxgl.Popup().setHTML(
            "<strong>Start</strong><p>Vessel started journey</p>",
          ),
        )
        .addTo(map.current);

      // Add end marker
      new mapboxgl.Marker({ color: "#cc0000" })
        .setLngLat(endPoint.coords as [number, number])
        .setPopup(
          new mapboxgl.Popup().setHTML(
            "<strong>End</strong><p>Vessel ended journey</p>",
          ),
        )
        .addTo(map.current);

      // Fit map to bounds
      map.current.fitBounds(bounds, {
        padding: 50,
        maxZoom: 14,
      });
      
      // Create current position marker
      const el = document.createElement('div');
      el.className = 'vessel-marker';
      el.innerHTML = '⛵';
      el.style.fontSize = '24px';
      
      currentMarkerRef.current = new mapboxgl.Marker(el)
        .setLngLat(vesselTrackData[0].coords as [number, number])
        .addTo(map.current);
    }
  }, [mapLoaded, vesselTrackData]);
  
  // Update current vessel position marker when currentPointIndex changes
  useEffect(() => {
    if (!map.current || !vesselTrackData.length || !currentMarkerRef.current) return;
    
    const currentPoint = vesselTrackData[currentPointIndex];
    if (currentPoint) {
      // Set marker position
      currentMarkerRef.current.setLngLat(currentPoint.coords as [number, number]);
      
      // Optionally rotate marker to match heading
      const el = currentMarkerRef.current.getElement();
      const rotation = currentPoint.hdg || currentPoint.cog || 0;
      el.style.transform = `rotate(${rotation}deg)`;
      
      // Pan map to follow vessel
      map.current.easeTo({
        center: currentPoint.coords as [number, number],
        duration: 1000
      });
    }
  }, [currentPointIndex, vesselTrackData]);

  return <div ref={mapContainer} className="map-container" />;
};

export default Map;
