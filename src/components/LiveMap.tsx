import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import mapboxgl, { LngLatBounds, Map as MapboxMap, Marker } from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { VesselDataPoint } from "../types/tripData";
import BoatIcon from "./BoatIcon";
import { createRoot } from "react-dom/client";
import { Root } from "react-dom/client";
import { useEventConfig } from "../hooks/useEventConfig";
import { MAP_STYLE, DEFAULT_CENTER, getSavedZoom, saveZoom, CENTER_VESSEL_ID } from "../utils/mapConfig";
import { OUR_BOAT } from "../config";
import { WindOverlay } from "./WindOverlay";
import { fetchWindGrid, blendBoatData, WindModel } from "../utils/windGrid";

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

export type ColorMode = "seesea" | "wind";

export interface LiveMapHandle {
  flyTo: (coords: [number, number]) => void;
}

interface LiveMapProps {
  vesselsData: Record<string, VesselDataPoint>;
  activeBoatId: number | null;
  onBoatClick: (boatId: number) => void;
  onClearActive: () => void;
}

const LiveMap = forwardRef<LiveMapHandle, LiveMapProps>(({ vesselsData, activeBoatId, onBoatClick, onClearActive }, ref) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<MapboxMap | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const markersRef = useRef<Record<string, Marker>>({});
  const [colorMode, setColorMode] = useState<ColorMode>("seesea");
  const [showOnlyHighlighted, setShowOnlyHighlighted] = useState(false);
  const [showWind, setShowWind] = useState(false);
  const [windModel, setWindModel] = useState<WindModel>("icon_2i");
  const [blendBoats, setBlendBoats] = useState(false);
  const rootsRef = useRef<Record<string, Root>>({});
  const hasCenteredRef = useRef(false);
  const windOverlayRef = useRef<WindOverlay | null>(null);
  const { crews, highlightedCrews } = useEventConfig();

  useImperativeHandle(ref, () => ({
    flyTo: (coords: [number, number]) => {
      map.current?.flyTo({ center: coords, zoom: 17, speed: 2 });
    },
  }));

  // Initialize map on component mount
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

    map.current.on("click", () => {
      onClearActive();
    });

    return () => {
      // Clean up all React roots
      Object.values(rootsRef.current).forEach((root) => {
        try {
          root.unmount();
        } catch (e) {
          console.error("Error unmounting React root:", e);
        }
      });

      // Remove the map instance (which will clean up all layers and sources)
      windOverlayRef.current?.destroy();
      map.current?.remove();
    };
  }, []);

  // Wind overlay lifecycle
  useEffect(() => {
    if (!mapLoaded || !map.current || !showWind) {
      windOverlayRef.current?.hide();
      return;
    }

    let refreshInterval: ReturnType<typeof setInterval>;

    const loadGrid = async () => {
      try {
        let grid = await fetchWindGrid(windModel);
        if (blendBoats && Object.keys(vesselsData).length > 0) {
          grid = blendBoatData(grid, vesselsData);
        }
        if (!map.current) return;
        if (!windOverlayRef.current) {
          windOverlayRef.current = new WindOverlay(map.current, grid);
        } else {
          windOverlayRef.current.updateGrid(grid);
        }
        windOverlayRef.current.show();
      } catch (err) {
        console.error("Failed to load wind grid:", err);
      }
    };

    loadGrid();
    refreshInterval = setInterval(loadGrid, 30 * 60 * 1000);

    return () => {
      clearInterval(refreshInterval);
      windOverlayRef.current?.hide();
    };
  }, [mapLoaded, showWind, windModel, blendBoats, vesselsData]);

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
          data.coords as [number, number],
        );
        hasValidBounds = true;
      } else {
        allBounds.extend(data.coords as [number, number]);
      }

      const crew = crews.find((c) => c.id === parseInt(vesselId));
      const isHighlighted = highlightedCrews.has(parseInt(vesselId));

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
            highlight={isHighlighted}
            isOurs={crew?.name === OUR_BOAT}
            selected={activeBoatId === parseInt(vesselId)}
            color={crew?.track_color}
            colorMode={colorMode}
            rotation={rotation}
            windDirection={data.twa}
            windSpeed={data.tws}
            showWindArrow={
              data.twa !== undefined && data.tws !== undefined && data.tws > 0
            }
          />,
        );
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
            highlight={isHighlighted}
            isOurs={crew?.name === OUR_BOAT}
            selected={activeBoatId === parseInt(vesselId)}
            color={crew?.track_color}
            colorMode={colorMode}
            rotation={rotation}
            windDirection={data.twa}
            windSpeed={data.tws}
            showWindArrow={
              data.twa !== undefined && data.tws !== undefined && data.tws > 0
            }
          />,
        );

        // Click handler to add to side panel
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          onBoatClick(parseInt(vesselId));
        });

        // Create the marker
        const marker = new mapboxgl.Marker({
          element: el,
          anchor: "center",
          rotationAlignment: "map",
        })
          .setLngLat(data.coords as [number, number])
          .addTo(map.current!);

        markersRef.current[vesselId] = marker;
      }
    });

    // Show/hide markers based on highlighted filter
    Object.entries(markersRef.current).forEach(([vesselId, marker]) => {
      const isHighlighted = highlightedCrews.has(parseInt(vesselId));
      const shouldShow = !showOnlyHighlighted || isHighlighted;
      marker.getElement().style.display = shouldShow ? "" : "none";
    });

    // Remove markers for vessels not in the current data
    existingVesselIds.forEach((id) => {
      if (!currentVesselIds.has(id)) {
        markersRef.current[id].remove();
        if (rootsRef.current[id]) {
          delete rootsRef.current[id];
        }
        delete markersRef.current[id];
      }
    });

    // Center on target vessel on first load with data
    if (!hasCenteredRef.current && Object.keys(markersRef.current).length > 0) {
      hasCenteredRef.current = true;
      const targetData = vesselsData[CENTER_VESSEL_ID];
      if (targetData?.coords) {
        map.current.setCenter(targetData.coords as [number, number]);
      } else if (hasValidBounds) {
        map.current.fitBounds(allBounds, { padding: 50, maxZoom: 12 });
      }
    }
  }, [mapLoaded, vesselsData, crews, highlightedCrews, showOnlyHighlighted, colorMode, activeBoatId]);

  return (
    <div className="map-wrapper">
      <div ref={mapContainer} className="map-container" />

      <div className="controls-panel">
        <div className="controls-panel__row">
          <span className="controls-panel__label">SeeSea</span>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={colorMode === "wind"}
              onChange={() => setColorMode(colorMode === "wind" ? "seesea" : "wind")}
            />
            <span className="toggle-switch__slider" />
          </label>
          <span className="controls-panel__label">Wind</span>
        </div>
        <div className="controls-panel__row">
          <span className="controls-panel__label">Highlighted only</span>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={showOnlyHighlighted}
              onChange={() => setShowOnlyHighlighted((prev) => !prev)}
            />
            <span className="toggle-switch__slider" />
          </label>
        </div>
        <div className="controls-panel__divider" />
        <div className="controls-panel__row">
          <span className="controls-panel__label">Wind overlay</span>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={showWind}
              onChange={() => setShowWind((prev) => !prev)}
            />
            <span className="toggle-switch__slider" />
          </label>
        </div>
        {showWind && (
          <>
            <div className="controls-panel__row">
              <label className="controls-panel__radio">
                <input
                  type="radio"
                  name="windModel"
                  checked={windModel === "icon_2i"}
                  onChange={() => setWindModel("icon_2i")}
                />
                ICON-2I
              </label>
              <label className="controls-panel__radio">
                <input
                  type="radio"
                  name="windModel"
                  checked={windModel === "ecmwf"}
                  onChange={() => setWindModel("ecmwf")}
                />
                ECMWF
              </label>
            </div>
            <div className="controls-panel__row">
              <span className="controls-panel__label">Blend boats</span>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={blendBoats}
                  onChange={() => setBlendBoats((prev) => !prev)}
                />
                <span className="toggle-switch__slider" />
              </label>
            </div>
          </>
        )}
      </div>
    </div>
  );
});

export default LiveMap;
