import { useEffect, useRef, MutableRefObject } from "react";
import { Map as MapboxMap } from "mapbox-gl";
import { VesselDataPoint } from "../types/tripData";

export function useFollowVessel(
  map: MutableRefObject<MapboxMap | null>,
  mapLoaded: boolean,
  followedBoatId: number | null,
  vesselsSnapshotRef: MutableRefObject<{ data: Record<string, VesselDataPoint>; receivedAt: number }>,
) {
  const followedBoatIdRef = useRef<number | null>(null);

  // Fly to vessel when follow starts
  useEffect(() => {
    followedBoatIdRef.current = followedBoatId;
    if (followedBoatId != null && map.current) {
      const vessel = vesselsSnapshotRef.current.data[String(followedBoatId)];
      if (vessel?.coords) {
        const currentZoom = map.current.getZoom();
        map.current.flyTo({
          center: vessel.coords,
          zoom: Math.max(currentZoom, 14),
          speed: 2,
        });
      }
    }
  }, [followedBoatId]);

  // Re-center on followed vessel during animation
  useEffect(() => {
    if (!mapLoaded) return;
    let raf = 0;
    let lastFollowCenter = 0;
    const tick = () => {
      const followId = followedBoatIdRef.current;
      if (followId != null && map.current) {
        const vessel = vesselsSnapshotRef.current.data[String(followId)];
        if (vessel?.coords) {
          const now = performance.now();
          if (now - lastFollowCenter > 1000) {
            const center = map.current.getCenter();
            const dx = Math.abs(center.lng - vessel.coords[0]);
            const dy = Math.abs(center.lat - vessel.coords[1]);
            if (dx > 0.00005 || dy > 0.00005) {
              map.current.easeTo({ center: vessel.coords, duration: 1000 });
              lastFollowCenter = now;
            }
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [mapLoaded]);
}
