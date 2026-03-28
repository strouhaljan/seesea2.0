import { useEffect, useRef, useState } from "react";
import mapboxgl, { LngLatBounds, Map as MapboxMap, Marker } from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { VesselDataPoint } from "../types/tripData";
import { generateColorFromId } from "../utils/svgGenerator";
import { Feature, Point, GeoJSON } from "geojson";
import BoatIcon from "./BoatIcon";
import { createRoot } from "react-dom/client";
import { Root } from "react-dom/client";
import { useEventConfig } from "../hooks/useEventConfig";
import { generateVesselPopupHTML } from "../utils/popupContent";
import { MAP_STYLE, DEFAULT_CENTER, DEFAULT_ZOOM } from "../utils/mapConfig";

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

interface LiveMapProps {
  vesselsData: Record<string, VesselDataPoint>;
}

// Helper function to generate GeoJSON for wind heatmap
const generateWindHeatmapData = (
  vesselsData: Record<string, VesselDataPoint>,
): GeoJSON => {
  const features: Feature<Point>[] = [];
  let skippedVessels = 0;

  Object.entries(vesselsData).forEach(([vesselId, data]) => {
    if (!data.coords || data.tws === undefined || data.tws === null) {
      skippedVessels++;
      return;
    }

    features.push({
      type: "Feature",
      properties: {
        tws: data.tws, // Wind speed
        vesselId: vesselId,
      },
      geometry: {
        type: "Point",
        coordinates: data.coords as [number, number],
      },
    });
  });

  if (skippedVessels > 0) {
    console.log(
      `Wind heatmap: Skipped ${skippedVessels} vessels with no wind data`,
    );
  }

  return {
    type: "FeatureCollection",
    features,
  };
};

const LiveMap = ({ vesselsData }: LiveMapProps) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<MapboxMap | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const markersRef = useRef<Record<string, Marker>>({});
  const [showWindHeatmap, setShowWindHeatmap] = useState(false);
  const [showOnlyHighlighted, setShowOnlyHighlighted] = useState(false);
  const rootsRef = useRef<Record<string, Root>>({});
  const popupsRef = useRef<Record<string, mapboxgl.Popup>>({});
  const { crews, highlightedCrews, toggleHighlight } = useEventConfig();

  // Store toggleHighlight in a ref so the delegated listener always sees the latest
  const toggleHighlightRef = useRef(toggleHighlight);
  toggleHighlightRef.current = toggleHighlight;

  // Initialize map on component mount
  useEffect(() => {
    if (!mapContainer.current) return;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: MAP_STYLE,
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
    });

    map.current.on("load", () => {
      setMapLoaded(true);
    });

    // Delegated click handler for highlight toggle stars in popups
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

      // Clean up all React roots
      Object.values(rootsRef.current).forEach((root) => {
        try {
          root.unmount();
        } catch (e) {
          console.error("Error unmounting React root:", e);
        }
      });

      // Remove the map instance (which will clean up all layers and sources)
      map.current?.remove();
    };
  }, []);

  // Add wind heatmap layer when map loads (only once)
  useEffect(() => {
    if (!mapLoaded || !map.current) return;

    // Only add the source and layer if they don't exist yet
    if (!map.current.getSource("wind-data")) {
      // Create empty data source for wind heatmap
      map.current.addSource("wind-data", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: [],
        },
      });

      // Add heatmap layer
      map.current.addLayer({
        id: "wind-heatmap",
        type: "heatmap",
        source: "wind-data",
        layout: {
          visibility: showWindHeatmap ? "visible" : "none",
        },
        paint: {
          // Increase weight with wind speed
          "heatmap-weight": [
            "interpolate",
            ["linear"],
            ["get", "tws"],
            0,
            0,
            5,
            0.3, // Light wind
            15,
            0.6, // Moderate wind
            25,
            0.9, // Strong wind
            35,
            1, // Very strong wind
          ],
          // Color gradient based on wind speed
          "heatmap-color": [
            "interpolate",
            ["linear"],
            ["heatmap-density"],
            0,
            "rgba(0, 255, 255, 0)",
            0.2,
            "rgba(0, 255, 255, 1)",
            0.4,
            "rgba(0, 255, 0, 1)",
            0.6,
            "rgba(255, 255, 0, 1)",
            0.8,
            "rgba(255, 140, 0, 1)",
            1,
            "rgba(255, 0, 0, 1)",
          ],
          // Radius based on zoom level
          "heatmap-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            0,
            20,
            9,
            30,
            15,
            40,
          ],
          // Opacity based on zoom level
          "heatmap-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            7,
            0.7,
            12,
            0.5,
          ],
        },
      });
    } else {
      // If the layer already exists, just update its visibility
      map.current.setLayoutProperty(
        "wind-heatmap",
        "visibility",
        showWindHeatmap ? "visible" : "none",
      );
    }

    // Add toggle controls
    const controlContainer = document.createElement("div");
    controlContainer.className = "mapboxgl-ctrl-top-right map-toggle-controls";

    // Wind heatmap toggle
    const windBtn = document.createElement("button");
    windBtn.className = `mapboxgl-ctrl mapboxgl-ctrl-group wind-toggle-btn ${
      showWindHeatmap ? "active" : ""
    }`;
    windBtn.innerHTML = "🌬️";
    windBtn.title = "Toggle Wind Heatmap";
    windBtn.onclick = () => {
      setShowWindHeatmap((prev) => !prev);
    };
    controlContainer.appendChild(windBtn);

    // Highlighted-only filter toggle
    const highlightBtn = document.createElement("button");
    highlightBtn.className = `mapboxgl-ctrl mapboxgl-ctrl-group wind-toggle-btn ${
      showOnlyHighlighted ? "active" : ""
    }`;
    highlightBtn.innerHTML = "⭐";
    highlightBtn.title = "Show only highlighted vessels";
    highlightBtn.onclick = () => {
      setShowOnlyHighlighted((prev) => !prev);
    };
    controlContainer.appendChild(highlightBtn);

    mapContainer.current?.appendChild(controlContainer);

    // Clean up the control when unmounted
    return () => {
      if (controlContainer.parentNode) {
        controlContainer.parentNode.removeChild(controlContainer);
      }
    };
  }, [mapLoaded, showWindHeatmap, showOnlyHighlighted]);

  // Update markers based on live data
  useEffect(() => {
    if (!mapLoaded || !map.current) return;

    console.log(
      "Updating vessel positions with",
      Object.keys(vesselsData).length,
      "vessels",
    );

    // Update wind heatmap data
    if (map.current.getSource("wind-data")) {
      const windData = generateWindHeatmapData(vesselsData);
      (map.current.getSource("wind-data") as mapboxgl.GeoJSONSource).setData(
        windData,
      );
    }

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
          data.coords as [number, number],
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

        if (!rootsRef.current[vesselId]) {
          rootsRef.current[vesselId] = createRoot(el);
        }

        rootsRef.current[vesselId].render(
          <BoatIcon
            highlight={highlightedCrews.has(parseInt(vesselId))}
            color={generateColorFromId(vesselId)}
            width={24}
            height={10}
            rotation={rotation}
            windDirection={data.twa}
            heading={data.hdg}
            windSpeed={data.tws}
            showWindArrow={
              data.twa !== undefined && data.tws !== undefined && data.tws > 0
            }
          />,
        );

        // Also update the popup content with latest data
        const vesselColor = generateColorFromId(vesselId);
        marker.getPopup().setHTML(generateVesselPopupHTML(
          vesselId,
          data,
          vesselColor,
          crews.find((crew) => crew.id === parseInt(vesselId))?.description,
          highlightedCrews.has(parseInt(vesselId)),
        ));
      } else {
        // Create new marker
        const el = document.createElement("div");
        el.className = "vessel-marker";
        el.style.width = "24px";
        el.style.height = "35px";

        // Generate initial boat icon
        const rotation = data.hdg || data.cog || 0;
        const root = createRoot(el);
        rootsRef.current[vesselId] = root;

        root.render(
          <BoatIcon
            highlight={highlightedCrews.has(parseInt(vesselId))}
            color={generateColorFromId(vesselId)}
            width={24}
            height={10}
            rotation={rotation}
            heading={data.hdg}
            windDirection={data.twa}
            windSpeed={data.tws}
            showWindArrow={
              data.twa !== undefined && data.tws !== undefined && data.tws > 0
            }
          />,
        );

        // Get vessel color for consistency
        const vesselColor = generateColorFromId(vesselId);

        // Add popup with vessel info, color, and wind data
        const popup = new mapboxgl.Popup({
          closeButton: false,
          closeOnClick: false,
          offset: 25,
        })
          .setHTML(generateVesselPopupHTML(
            vesselId,
            data,
            vesselColor,
            crews.find((crew) => crew.id === parseInt(vesselId))?.description,
            highlightedCrews.has(parseInt(vesselId)),
          ));

        popupsRef.current[vesselId] = popup;

        // Close all other popups when this one opens
        popup.on("open", () => {
          Object.entries(popupsRef.current).forEach(([id, p]) => {
            if (id !== vesselId && p.isOpen()) p.remove();
          });
        });

        // Create the marker
        const marker = new mapboxgl.Marker({
          element: el,
          anchor: "center",
          rotationAlignment: "map",
        })
          .setLngLat(data.coords as [number, number])
          .setPopup(popup)
          .addTo(map.current!);

        markersRef.current[vesselId] = marker;
      }
    });

    // Show/hide markers based on highlighted filter
    Object.entries(markersRef.current).forEach(([vesselId, marker]) => {
      const isHighlighted = highlightedCrews.has(parseInt(vesselId));
      const shouldShow = !showOnlyHighlighted || isHighlighted;
      marker.getElement().style.display = shouldShow ? "" : "none";
      if (!shouldShow && marker.getPopup()?.isOpen()) {
        marker.getPopup()?.remove();
      }
    });

    // Remove markers for vessels not in the current data
    existingVesselIds.forEach((id) => {
      if (!currentVesselIds.has(id)) {
        markersRef.current[id].remove();
        if (rootsRef.current[id]) {
          // Unmount the root before deleting
          delete rootsRef.current[id];
        }
        delete markersRef.current[id];
        delete popupsRef.current[id];
      }
    });

    // Fit map to all bounds on first load with data
    if (
      hasValidBounds &&
      Object.keys(markersRef.current).length > 0 &&
      Object.keys(markersRef.current).length !== existingVesselIds.size
    ) {
      map.current.fitBounds(allBounds, {
        padding: 50,
        maxZoom: 12,
      });
    }
  }, [mapLoaded, vesselsData, highlightedCrews, showOnlyHighlighted]);

  return (
    <div className="map-wrapper">
      <div ref={mapContainer} className="map-container" />

      {showWindHeatmap && (
        <div className="wind-legend">
          <div className="legend-title">Wind Speed (knots)</div>
          <div className="legend-scale">
            <div className="legend-item">
              <span
                className="legend-color"
                style={{ backgroundColor: "rgba(0, 255, 255, 0.5)" }}
              ></span>
              <span>Light (&lt;5)</span>
            </div>
            <div className="legend-item">
              <span
                className="legend-color"
                style={{ backgroundColor: "rgba(0, 255, 0, 0.5)" }}
              ></span>
              <span>Moderate (5-15)</span>
            </div>
            <div className="legend-item">
              <span
                className="legend-color"
                style={{ backgroundColor: "rgba(255, 255, 0, 0.5)" }}
              ></span>
              <span>Strong (15-25)</span>
            </div>
            <div className="legend-item">
              <span
                className="legend-color"
                style={{ backgroundColor: "rgba(255, 140, 0, 0.7)" }}
              ></span>
              <span>Very Strong (25-35)</span>
            </div>
            <div className="legend-item">
              <span
                className="legend-color"
                style={{ backgroundColor: "rgba(255, 0, 0, 0.8)" }}
              ></span>
              <span>Severe (&gt;35)</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LiveMap;
