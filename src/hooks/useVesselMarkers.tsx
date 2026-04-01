import { useEffect, useRef, MutableRefObject } from "react";
import mapboxgl, { LngLatBounds, Map as MapboxMap, Marker } from "mapbox-gl";
import { createRoot, Root } from "react-dom/client";
import { VesselDataPoint } from "../types/tripData";
import { ColorMode } from "../types/map";
import { futurePosition } from "../utils/futurePosition";
import { CENTER_VESSEL_ID } from "../utils/mapConfig";
import { OUR_BOAT } from "../config";
import BoatIcon from "../components/BoatIcon";
import { Crew } from "../hooks/useEventConfig";

interface UseVesselMarkersOptions {
  vesselsData: Record<string, VesselDataPoint>;
  crews: Crew[];
  highlightedCrews: Set<number>;
  showOnlyHighlighted: boolean;
  colorMode: ColorMode;
  activeBoatId: number | null;
  followedBoatId: number | null;
  onBoatClick: (boatId: number) => void;
}

export function useVesselMarkers(
  map: MutableRefObject<MapboxMap | null>,
  mapLoaded: boolean,
  options: UseVesselMarkersOptions,
) {
  const { vesselsData, crews, highlightedCrews, showOnlyHighlighted, colorMode, activeBoatId, followedBoatId, onBoatClick } = options;
  const markersRef = useRef<Record<string, Marker>>({});
  const rootsRef = useRef<Record<string, Root>>({});
  const hasCenteredRef = useRef(false);
  const vesselsSnapshotRef = useRef<{ data: Record<string, VesselDataPoint>; receivedAt: number }>({ data: {}, receivedAt: 0 });

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
        const now = performance.now();
        const elapsedMin = (now - receivedAt) / 60_000;
        for (const [id, vessel] of Object.entries(data)) {
          const marker = markersRef.current[id];
          if (!marker || !vessel.coords) continue;
          const cog = vessel.cog || vessel.hdg || 0;
          const sog = vessel.sog || 0;
          if (sog > 0 && cog) {
            const pos = futurePosition(vessel.coords, sog, cog, elapsedMin);
            marker.setLngLat(pos);
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

    let allBounds = new LngLatBounds();
    let hasValidBounds = false;
    const currentVesselIds = new Set(Object.keys(vesselsData));
    const existingVesselIds = new Set(Object.keys(markersRef.current));

    Object.entries(vesselsData).forEach(([vesselId, data]) => {
      if (!data.coords) return;

      if (!hasValidBounds) {
        allBounds = new LngLatBounds(data.coords as [number, number], data.coords as [number, number]);
        hasValidBounds = true;
      } else {
        allBounds.extend(data.coords as [number, number]);
      }

      const crew = crews.find((c) => c.id === parseInt(vesselId));
      const isHighlighted = highlightedCrews.has(parseInt(vesselId));

      if (markersRef.current[vesselId]) {
        const marker = markersRef.current[vesselId];
        marker.setLngLat(data.coords as [number, number]);
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
            followed={followedBoatId === parseInt(vesselId)}
            color={crew?.track_color}
            colorMode={colorMode}
            rotation={rotation}
            windDirection={data.twa}
            windSpeed={data.tws}
            showWindArrow={data.twa !== undefined && data.tws !== undefined && data.tws > 0}
            number={crew?.start_number}
          />,
        );
      } else {
        const el = document.createElement("div");
        el.className = "vessel-marker";
        el.style.width = "36px";
        el.style.height = "50px";
        const rotation = data.hdg || data.cog || 0;
        const root = createRoot(el);
        rootsRef.current[vesselId] = root;
        root.render(
          <BoatIcon
            highlight={isHighlighted}
            isOurs={crew?.name === OUR_BOAT}
            selected={activeBoatId === parseInt(vesselId)}
            followed={followedBoatId === parseInt(vesselId)}
            color={crew?.track_color}
            colorMode={colorMode}
            rotation={rotation}
            windDirection={data.twa}
            windSpeed={data.tws}
            showWindArrow={data.twa !== undefined && data.tws !== undefined && data.tws > 0}
            number={crew?.start_number}
          />,
        );
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          onBoatClick(parseInt(vesselId));
        });
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

    // Show/hide markers and set z-index
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
        delete rootsRef.current[id];
        delete markersRef.current[id];
      }
    });

    // Center on target vessel on first load
    if (!hasCenteredRef.current && Object.keys(markersRef.current).length > 0) {
      hasCenteredRef.current = true;
      const targetData = vesselsData[CENTER_VESSEL_ID];
      if (targetData?.coords) {
        map.current.setCenter(targetData.coords as [number, number]);
      } else if (hasValidBounds) {
        map.current.fitBounds(allBounds, { padding: 50, maxZoom: 12 });
      }
    }
  }, [mapLoaded, vesselsData, crews, highlightedCrews, showOnlyHighlighted, colorMode, activeBoatId, followedBoatId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      Object.values(rootsRef.current).forEach((root) => {
        try { root.unmount(); } catch (e) { console.error("Error unmounting React root:", e); }
      });
    };
  }, []);

  return { markersRef, vesselsSnapshotRef };
}
