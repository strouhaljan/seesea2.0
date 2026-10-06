import { forwardRef, MutableRefObject, useEffect, useImperativeHandle, useRef, useState } from "react";
import mapboxgl, { Map as MapboxMap } from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { VesselDataPoint } from "../types/tripData";
import { useEventConfig } from "../hooks/useEventConfig";
import { MAP_STYLES, DEFAULT_CENTER, getSavedZoom, saveZoom, getSavedTheme } from "../utils/mapConfig";
import { TailsData } from "../hooks/useTails";
import { HistoryTimelines } from "../hooks/useHistoryData";
import { LegMarker } from "../hooks/useLegMarkers";
import type { MapControlsState } from "../hooks/useMapControls";
import { useVesselMarkers } from "../hooks/useVesselMarkers";
import { useFutureProjections } from "../hooks/useFutureProjections";
import { useTailLayer } from "../hooks/useTailLayer";
import { useLegLayer } from "../hooks/useLegLayer";
import { useWindOverlay } from "../hooks/useWindOverlay";
import { useFollowVessel } from "../hooks/useFollowVessel";
import { useDistanceMeasure } from "../hooks/useDistanceMeasure";
import { MapControls } from "./MapControls";
import { WindSpeedLegend } from "./WindSpeedLegend";

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

export type { ColorMode } from "../types/map";

export interface LiveMapHandle {
  flyTo: (coords: [number, number]) => void;
  /** Pan to the boat without changing zoom; `bottomPadding` is the padding the map is heading to. */
  centerOn: (coords: [number, number], bottomPadding?: number) => void;
  /** Keep centring/following clear of the phone sheet. */
  setBottomPadding: (px: number) => void;
}

import { EventLeg } from "../hooks/useEventConfig";

interface LiveMapProps {
  vesselsData: Record<string, VesselDataPoint>;
  tails: TailsData;
  trackLengthMax: number;
  legMarkers: LegMarker[];
  legs: EventLeg[];
  activeLegId: number | null;
  activeBoatId: number | null;
  followedBoatId: number | null;
  onBoatClick: (boatId: number) => void;
  onClearActive: () => void;
  isHistoryMode?: boolean;
  historyTimelines?: HistoryTimelines;
  simTimeRef?: MutableRefObject<number | null>;
  /** Desktop settings panel open. */
  controlsOpen: boolean;
  /** Phones show settings in the boat sheet, so the map renders no panel at all. */
  hideControls: boolean;
  controls: MapControlsState;
}

const LiveMap = forwardRef<LiveMapHandle, LiveMapProps>(({
  vesselsData, tails, trackLengthMax, legMarkers,
  legs, activeLegId,
  activeBoatId, followedBoatId,
  onBoatClick, onClearActive,
  isHistoryMode = false, historyTimelines, simTimeRef, controlsOpen, hideControls, controls,
}, ref) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<MapboxMap | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const { crews, highlightedCrews, center } = useEventConfig();

  useImperativeHandle(ref, () => ({
    flyTo: (coords: [number, number]) => {
      map.current?.flyTo({ center: coords, zoom: 17, speed: 2 });
    },
    centerOn: (coords: [number, number], bottomPadding?: number) => {
      // Animate padding together with the pan: a separate setPadding would cancel the animation
      const padding = bottomPadding == null ? undefined : { top: 0, left: 0, right: 0, bottom: bottomPadding };
      map.current?.easeTo({ center: coords, duration: 600, padding });
    },
    setBottomPadding: (px: number) => {
      const m = map.current;
      if (!m) return;
      const apply = () => {
        if (m.getPadding().bottom !== px) m.setPadding({ top: 0, left: 0, right: 0, bottom: px });
      };
      // setPadding mid-animation cancels it (e.g. centring on a tapped boat), so apply once it ends
      if (m.isEasing()) m.once("moveend", apply);
      else apply();
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
      center: center ?? DEFAULT_CENTER,
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
    isHistoryMode, historyTimelines, simTimeRef,
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
    colorMode: controls.colorMode,
  });

  useLegLayer(map, mapLoaded, legMarkers);

  useWindOverlay(map, mapLoaded, {
    showWind: controls.showWind,
    windModel: controls.windModel,
    blendBoats: controls.blendBoats,
    vesselsData, isHistoryMode,
    futureMinutes: controls.futureMinutes,
  });

  useFollowVessel(map, mapLoaded, followedBoatId, vesselsSnapshotRef);
  useDistanceMeasure(map, mapLoaded);

  return (
    <div className="map-wrapper">
      <div ref={mapContainer} className="map-container" />
      {controls.colorMode === "wind" && <WindSpeedLegend />}
      {!hideControls && <MapControls
        controlsOpen={controlsOpen}
        controls={controls}
        legs={legs}
        activeLegId={activeLegId}
        trackLengthMax={trackLengthMax}
        isHistoryMode={isHistoryMode}
      />}
    </div>
  );
});

export default LiveMap;
