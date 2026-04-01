import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import mapboxgl, { Map as MapboxMap } from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { VesselDataPoint } from "../types/tripData";
import { useEventConfig } from "../hooks/useEventConfig";
import { MAP_STYLES, DEFAULT_CENTER, getSavedZoom, saveZoom, getSavedTheme } from "../utils/mapConfig";
import { TailsData } from "../hooks/useTails";
import { LegMarker } from "../hooks/useLegMarkers";
import { useMapControls } from "../hooks/useMapControls";
import { useVesselMarkers } from "../hooks/useVesselMarkers";
import { useFutureProjections } from "../hooks/useFutureProjections";
import { useTailLayer } from "../hooks/useTailLayer";
import { useLegLayer } from "../hooks/useLegLayer";
import { useWindOverlay } from "../hooks/useWindOverlay";
import { useFollowVessel } from "../hooks/useFollowVessel";
import { MapControls } from "./MapControls";

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

export type { ColorMode } from "../types/map";

export interface LiveMapHandle {
  flyTo: (coords: [number, number]) => void;
}

interface LiveMapProps {
  vesselsData: Record<string, VesselDataPoint>;
  tails: TailsData;
  trackLengthMax: number;
  legMarkers: LegMarker[];
  activeBoatId: number | null;
  followedBoatId: number | null;
  onBoatClick: (boatId: number) => void;
  onClearActive: () => void;
  onStopFollow: () => void;
  isHistoryMode?: boolean;
  controlsOpen: boolean;
  onToggleControls: () => void;
}

const LiveMap = forwardRef<LiveMapHandle, LiveMapProps>(({
  vesselsData, tails, trackLengthMax, legMarkers,
  activeBoatId, followedBoatId,
  onBoatClick, onClearActive, onStopFollow,
  isHistoryMode = false, controlsOpen, onToggleControls,
}, ref) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<MapboxMap | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const { crews, highlightedCrews } = useEventConfig();

  const controls = useMapControls();

  useImperativeHandle(ref, () => ({
    flyTo: (coords: [number, number]) => {
      map.current?.flyTo({ center: coords, zoom: 17, speed: 2 });
    },
  }));

  // Set initial data-theme attribute
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", controls.mapTheme);
  }, []);

  // Switch map style when theme changes
  useEffect(() => {
    if (!map.current) return;
    setMapLoaded(false);
    map.current.once("style.load", () => setMapLoaded(true));
    map.current.setStyle(MAP_STYLES[controls.mapTheme]);
  }, [controls.mapTheme]);

  // Initialize map
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
    map.current.on("load", () => setMapLoaded(true));
    map.current.on("zoomend", () => { if (map.current) saveZoom(map.current.getZoom()); });
    map.current.on("click", () => onClearActive());

    return () => { map.current?.remove(); };
  }, []);

  const { vesselsSnapshotRef } = useVesselMarkers(map, mapLoaded, {
    vesselsData, crews, highlightedCrews,
    showOnlyHighlighted: controls.showOnlyHighlighted,
    colorMode: controls.colorMode,
    activeBoatId, followedBoatId, onBoatClick,
  });

  useFutureProjections(map, mapLoaded, {
    vesselsData,
    futureMinutes: controls.futureMinutes,
    isHistoryMode, crews, highlightedCrews,
    showOnlyHighlighted: controls.showOnlyHighlighted,
    colorMode: controls.colorMode,
  });

  useTailLayer(map, mapLoaded, {
    tails,
    trailMinutes: controls.trailMinutes,
    isHistoryMode, crews, highlightedCrews,
    showOnlyHighlighted: controls.showOnlyHighlighted,
  });

  useLegLayer(map, mapLoaded, legMarkers);

  useWindOverlay(map, mapLoaded, {
    showWind: controls.showWind,
    windModel: controls.windModel,
    blendBoats: controls.blendBoats,
    vesselsData, isHistoryMode,
    futureMinutes: controls.futureMinutes,
  });

  useFollowVessel(map, mapLoaded, followedBoatId, vesselsSnapshotRef, onStopFollow);

  return (
    <div className="map-wrapper">
      <div ref={mapContainer} className="map-container" />
      <MapControls
        controlsOpen={controlsOpen}
        colorMode={controls.colorMode}
        setColorMode={controls.setColorMode}
        showOnlyHighlighted={controls.showOnlyHighlighted}
        setShowOnlyHighlighted={controls.setShowOnlyHighlighted}
        futureMinutes={controls.futureMinutes}
        setFutureMinutes={controls.setFutureMinutes}
        trailMinutes={controls.trailMinutes}
        setTrailMinutes={controls.setTrailMinutes}
        trackLengthMax={trackLengthMax}
        showWind={controls.showWind}
        setShowWind={controls.setShowWind}
        windModel={controls.windModel}
        setWindModel={controls.setWindModel}
        blendBoats={controls.blendBoats}
        setBlendBoats={controls.setBlendBoats}
        mapTheme={controls.mapTheme}
        setMapTheme={controls.setMapTheme}
        isHistoryMode={isHistoryMode}
      />
    </div>
  );
});

export default LiveMap;
