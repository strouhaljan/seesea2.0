import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import mapboxgl, { LngLatBounds, Map as MapboxMap, Marker } from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { VesselDataPoint } from "../types/tripData";
import BoatIcon from "./BoatIcon";
import { createRoot } from "react-dom/client";
import { Root } from "react-dom/client";
import { useEventConfig } from "../hooks/useEventConfig";
import { MAP_STYLES, DEFAULT_CENTER, getSavedZoom, saveZoom, CENTER_VESSEL_ID, getSavedTheme, saveTheme, MapTheme } from "../utils/mapConfig";
import { OUR_BOAT } from "../config";
import { WindOverlay } from "./WindOverlay";
import { fetchWindGrid, blendBoatData, WindModel } from "../utils/windGrid";
import { TailsData } from "../hooks/useTails";

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

export type ColorMode = "seesea" | "wind";

const FUTURE_STEPS = [15, 30, 45, 60]; // slider tick values in minutes
const FUTURE_LINE_SOURCE = "future-position-lines";
const FUTURE_LINE_LAYER = "future-position-lines-layer";
const TAIL_LINE_SOURCE = "tail-lines";
const TAIL_LINE_LAYER = "tail-lines-layer";
const TRAIL_STEPS = [15, 30, 60, 120, 180]; // minutes

/** Calculate a future position given current coords, speed (knots), and course (degrees from north). */
function futurePosition(
  coords: [number, number],
  sogKnots: number,
  cogDeg: number,
  minutes: number,
): [number, number] {
  const distanceNm = sogKnots * (minutes / 60);
  const cogRad = (cogDeg * Math.PI) / 180;
  const latRad = (coords[1] * Math.PI) / 180;
  const newLat = coords[1] + (distanceNm * Math.cos(cogRad)) / 60;
  const newLng = coords[0] + (distanceNm * Math.sin(cogRad)) / (60 * Math.cos(latRad));
  return [newLng, newLat];
}

export interface LiveMapHandle {
  flyTo: (coords: [number, number]) => void;
}

interface LiveMapProps {
  vesselsData: Record<string, VesselDataPoint>;
  tails: TailsData;
  trackLengthMax: number;
  activeBoatId: number | null;
  onBoatClick: (boatId: number) => void;
  onClearActive: () => void;
  controlsOpen: boolean;
  onToggleControls: () => void;
}

const LiveMap = forwardRef<LiveMapHandle, LiveMapProps>(({ vesselsData, tails, trackLengthMax, activeBoatId, onBoatClick, onClearActive, controlsOpen, onToggleControls }, ref) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<MapboxMap | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const markersRef = useRef<Record<string, Marker>>({});
  const [colorMode, setColorMode] = useState<ColorMode>(
    () => (localStorage.getItem("colorMode") as ColorMode) || "seesea"
  );
  const [showOnlyHighlighted, setShowOnlyHighlighted] = useState(
    () => localStorage.getItem("showOnlyHighlighted") === "true"
  );
  const [showWind, setShowWind] = useState(
    () => localStorage.getItem("showWind") === "true"
  );
  const [windModel, setWindModel] = useState<WindModel>(
    () => (localStorage.getItem("windModel") as WindModel) || "icon_2i"
  );
  const [blendBoats, setBlendBoats] = useState(
    () => localStorage.getItem("blendBoats") === "true"
  );
  const [futureMinutes, setFutureMinutes] = useState(
    () => parseInt(localStorage.getItem("futureMinutes") || "0", 10)
  );
  const [trailMinutes, setTrailMinutes] = useState(
    () => parseInt(localStorage.getItem("trailMinutes") || "0", 10)
  );
  const [mapTheme, setMapTheme] = useState<MapTheme>(getSavedTheme);
  const rootsRef = useRef<Record<string, Root>>({});
  const futureMarkersRef = useRef<Record<string, Marker>>({});
  const futureRootsRef = useRef<Record<string, Root>>({});
  const hasCenteredRef = useRef(false);
  const vesselsSnapshotRef = useRef<{ data: Record<string, VesselDataPoint>; receivedAt: number }>({ data: {}, receivedAt: 0 });
  const windOverlayRef = useRef<WindOverlay | null>(null);
  const { crews, highlightedCrews } = useEventConfig();

  useEffect(() => {
    localStorage.setItem("colorMode", colorMode);
  }, [colorMode]);

  useEffect(() => {
    localStorage.setItem("showOnlyHighlighted", String(showOnlyHighlighted));
  }, [showOnlyHighlighted]);

  useEffect(() => {
    localStorage.setItem("showWind", String(showWind));
  }, [showWind]);

  useEffect(() => {
    localStorage.setItem("windModel", windModel);
  }, [windModel]);

  useEffect(() => {
    localStorage.setItem("blendBoats", String(blendBoats));
  }, [blendBoats]);

  useEffect(() => {
    localStorage.setItem("futureMinutes", String(futureMinutes));
  }, [futureMinutes]);

  useEffect(() => {
    localStorage.setItem("trailMinutes", String(trailMinutes));
  }, [trailMinutes]);

  // Switch map style when theme changes
  useEffect(() => {
    saveTheme(mapTheme);
    document.documentElement.setAttribute("data-theme", mapTheme);
    if (!map.current) return;
    // setStyle removes all custom sources/layers — set mapLoaded to false
    // so the vessel-update effect re-adds them after the new style loads
    setMapLoaded(false);
    map.current.once("style.load", () => setMapLoaded(true));
    map.current.setStyle(MAP_STYLES[mapTheme]);
  }, [mapTheme]);

  // Set initial data-theme attribute
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", mapTheme);
  }, []);

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
      style: MAP_STYLES[getSavedTheme()],
      center: DEFAULT_CENTER,
      zoom: getSavedZoom(),
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
    });

    map.current.touchZoomRotate.disableRotation();

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
        try { root.unmount(); } catch (e) { console.error("Error unmounting React root:", e); }
      });
      Object.values(futureRootsRef.current).forEach((root) => {
        try { root.unmount(); } catch (e) { /* ignore */ }
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

  // Snapshot vessel data with receive timestamp for interpolation
  useEffect(() => {
    if (Object.keys(vesselsData).length > 0) {
      vesselsSnapshotRef.current = { data: vesselsData, receivedAt: performance.now() };
    }
  }, [vesselsData]);

  // Animate marker positions between data updates using SOG/COG projection
  useEffect(() => {
    if (!mapLoaded) return;
    let raf = 0;
    const tick = () => {
      const { data, receivedAt } = vesselsSnapshotRef.current;
      if (receivedAt > 0) {
        const elapsedMin = (performance.now() - receivedAt) / 60_000;
        for (const [id, vessel] of Object.entries(data)) {
          const marker = markersRef.current[id];
          if (!marker || !vessel.coords) continue;
          const cog = vessel.cog || vessel.hdg || 0;
          const sog = vessel.sog || 0;
          if (sog > 0 && cog) {
            marker.setLngLat(futurePosition(vessel.coords, sog, cog, elapsedMin));
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [mapLoaded]);

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
            number={crew?.start_number}
          />,
        );
      } else {
        // Create new marker
        const el = document.createElement("div");
        el.className = "vessel-marker";
        el.style.width = "36px";
        el.style.height = "50px";

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
            number={crew?.start_number}
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

    // Show/hide markers and set z-index for highlighted/selected vessels
    Object.entries(markersRef.current).forEach(([vesselId, marker]) => {
      const vid = parseInt(vesselId);
      const isHighlighted = highlightedCrews.has(vid);
      const isSelected = activeBoatId === vid;
      const shouldShow = !showOnlyHighlighted || isHighlighted;
      const el = marker.getElement();
      el.style.display = shouldShow ? "" : "none";
      el.style.zIndex = isSelected ? "3" : isHighlighted ? "2" : "1";
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

    // --- Future position markers & path lines ---
    // Clean up existing future markers
    Object.values(futureMarkersRef.current).forEach((m) => m.remove());
    Object.values(futureRootsRef.current).forEach((r) => {
      try { r.unmount(); } catch (_) { /* ignore */ }
    });
    futureMarkersRef.current = {};
    futureRootsRef.current = {};

    // Build GeoJSON lines for all vessels
    const lineFeatures: GeoJSON.Feature<GeoJSON.LineString>[] = [];

    if (futureMinutes > 0) {
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

        // Path line from current to future position
        lineFeatures.push({
          type: "Feature",
          properties: { color: crew?.track_color || "#888" },
          geometry: {
            type: "LineString",
            coordinates: [coords, futureCoords],
          },
        });

        // Ghost marker at future position
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

    // Update or create the GeoJSON line source/layer
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

    // --- Tail trail lines ---
    const tailFeatures: GeoJSON.Feature<GeoJSON.LineString>[] = [];

    if (trailMinutes > 0 && Object.keys(tails).length > 0) {
      const cutoff = Date.now() / 1000 - trailMinutes * 60;
      Object.entries(tails).forEach(([vesselId, points]) => {
        const isHighlighted = highlightedCrews.has(parseInt(vesselId));
        const shouldShow = !showOnlyHighlighted || isHighlighted;
        if (!shouldShow) return;

        // Filter points within the time window
        const filtered = points.filter((p) => p[0] >= cutoff);
        if (filtered.length < 2) return;

        const crew = crews.find((c) => c.id === parseInt(vesselId));
        // API returns [timestamp, lng, lat] — MapBox needs [lng, lat]
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
    const existingTailSource = map.current.getSource(TAIL_LINE_SOURCE) as mapboxgl.GeoJSONSource | undefined;
    if (existingTailSource) {
      existingTailSource.setData(tailGeojson);
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
  }, [mapLoaded, vesselsData, crews, highlightedCrews, showOnlyHighlighted, colorMode, activeBoatId, futureMinutes, tails, trailMinutes]);

  // Swipe right on controls panel to close
  const controlsTouchRef = useRef<{ startX: number; startY: number } | null>(null);
  const handleControlsTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    controlsTouchRef.current = { startX: touch.clientX, startY: touch.clientY };
  }, []);
  const handleControlsTouchEnd = useCallback((e: React.TouchEvent) => {
    const ref = controlsTouchRef.current;
    if (!ref) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - ref.startX;
    const dy = Math.abs(touch.clientY - ref.startY);
    controlsTouchRef.current = null;
    if (dx > 60 && dx > dy && controlsOpen) {
      onToggleControls();
    }
  }, [controlsOpen, onToggleControls]);

  return (
    <div className="map-wrapper">
      <div ref={mapContainer} className="map-container" />

      <div className="controls-stack">
        <div
          className={`controls-panel ${controlsOpen ? "" : "controls-panel--hidden"}`}
          onTouchStart={handleControlsTouchStart}
          onTouchEnd={handleControlsTouchEnd}
        >
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
        <div className="controls-panel__row controls-panel__row--column">
          <span className="controls-panel__label">
            Future position{futureMinutes > 0 ? `: ${futureMinutes} min` : ""}
          </span>
          <input
            type="range"
            className="future-slider"
            min={0}
            max={60}
            step={15}
            value={futureMinutes}
            onChange={(e) => setFutureMinutes(parseInt(e.target.value, 10))}
          />
          <div className="future-slider__ticks">
            <span>Off</span>
            {FUTURE_STEPS.map((m) => (
              <span key={m}>{m}m</span>
            ))}
          </div>
        </div>
        <div className="controls-panel__row controls-panel__row--column">
          <span className="controls-panel__label">
            Trail{trailMinutes > 0 ? `: ${trailMinutes >= 60 ? `${trailMinutes / 60}h` : `${trailMinutes} min`}` : ""}
          </span>
          <input
            type="range"
            className="future-slider"
            min={0}
            max={trackLengthMax / 60}
            step={15}
            value={trailMinutes}
            onChange={(e) => setTrailMinutes(parseInt(e.target.value, 10))}
          />
          <div className="future-slider__ticks">
            <span>Off</span>
            {TRAIL_STEPS.filter((m) => m <= trackLengthMax / 60).map((m) => (
              <span key={m}>{m >= 60 ? `${m / 60}h` : `${m}m`}</span>
            ))}
          </div>
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
        <div className="controls-panel__divider" />
        <div className="controls-panel__row">
          <span className="controls-panel__label">Dark</span>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={mapTheme === "light"}
              onChange={() => setMapTheme(mapTheme === "dark" ? "light" : "dark")}
            />
            <span className="toggle-switch__slider" />
          </label>
          <span className="controls-panel__label">Light</span>
        </div>
        </div>
      </div>
    </div>
  );
});

export default LiveMap;
