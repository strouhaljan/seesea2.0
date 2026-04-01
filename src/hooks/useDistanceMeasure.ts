import { useEffect, useRef, MutableRefObject } from "react";
import mapboxgl, { Map as MapboxMap, Marker, Popup } from "mapbox-gl";
import { distanceNm } from "../utils/distance";

const HOLD_MS = 1000;
const MOVE_TOLERANCE_PX = 15;
const LINE_SOURCE = "distance-measure-line";
const LINE_LAYER = "distance-measure-line-layer";

/**
 * Two-finger long-press on the map draws a line and shows distance in nm.
 * Hold two fingers for 1 s → measure activates.
 * Once active, moving fingers updates the measurement in real time.
 * Lifting fingers clears the measurement.
 */
export function useDistanceMeasure(
  map: MutableRefObject<MapboxMap | null>,
  mapLoaded: boolean,
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRef = useRef(false);
  const markersRef = useRef<Marker[]>([]);
  const popupRef = useRef<Popup | null>(null);
  const startPosRef = useRef<{ x1: number; y1: number; x2: number; y2: number } | null>(null);

  useEffect(() => {
    if (!map.current || !mapLoaded) return;
    const m = map.current;
    const canvas = m.getCanvas();

    function clearVisuals() {
      markersRef.current.forEach((mk) => mk.remove());
      markersRef.current = [];
      popupRef.current?.remove();
      popupRef.current = null;

      const mp = map.current;
      if (!mp) return;
      if (mp.getLayer(LINE_LAYER)) mp.removeLayer(LINE_LAYER);
      if (mp.getSource(LINE_SOURCE)) mp.removeSource(LINE_SOURCE);
    }

    function deactivate() {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      startPosRef.current = null;

      if (!activeRef.current) return;
      activeRef.current = false;
      clearVisuals();

      const mp = map.current;
      if (!mp) return;
      mp.dragPan.enable();
      mp.touchZoomRotate.enable();
    }

    function renderMeasurement(x1: number, y1: number, x2: number, y2: number) {
      const mp = map.current;
      if (!mp) return;

      const rect = canvas.getBoundingClientRect();
      const p1 = mp.unproject([x1 - rect.left, y1 - rect.top]);
      const p2 = mp.unproject([x2 - rect.left, y2 - rect.top]);

      const coord1: [number, number] = [p1.lng, p1.lat];
      const coord2: [number, number] = [p2.lng, p2.lat];
      const dist = distanceNm(coord1, coord2);

      // Line
      const geojson: GeoJSON.Feature<GeoJSON.LineString> = {
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: [coord1, coord2] },
      };

      if (mp.getSource(LINE_SOURCE)) {
        (mp.getSource(LINE_SOURCE) as mapboxgl.GeoJSONSource).setData(geojson);
      } else {
        mp.addSource(LINE_SOURCE, { type: "geojson", data: geojson });
        mp.addLayer({
          id: LINE_LAYER,
          type: "line",
          source: LINE_SOURCE,
          paint: {
            "line-color": "#00bfff",
            "line-width": 2,
            "line-dasharray": [4, 3],
          },
        });
      }

      // Endpoint dots
      markersRef.current.forEach((mk) => mk.remove());
      markersRef.current = [coord1, coord2].map((c) => {
        const el = document.createElement("div");
        el.style.cssText =
          "width:10px;height:10px;border-radius:50%;background:#00bfff;border:2px solid #fff;";
        return new Marker({ element: el }).setLngLat(c).addTo(mp);
      });

      // Distance label at midpoint
      const midLng = (coord1[0] + coord2[0]) / 2;
      const midLat = (coord1[1] + coord2[1]) / 2;
      const label = dist < 0.01 ? dist.toFixed(4) : dist < 1 ? dist.toFixed(3) : dist.toFixed(2);

      popupRef.current?.remove();
      popupRef.current = new Popup({
        closeButton: false,
        closeOnClick: false,
        className: "distance-popup",
      })
        .setLngLat([midLng, midLat])
        .setHTML(`<span style="font-weight:600;font-size:14px;">${label} nm</span>`)
        .addTo(mp);
    }

    function onTouchStart(e: TouchEvent) {
      if (e.touches.length === 2) {
        const t = e.touches;
        startPosRef.current = {
          x1: t[0].clientX, y1: t[0].clientY,
          x2: t[1].clientX, y2: t[1].clientY,
        };
        timerRef.current = setTimeout(() => {
          timerRef.current = null;
          const sp = startPosRef.current;
          if (!sp || !map.current) return;
          activeRef.current = true;
          map.current.dragPan.disable();
          map.current.touchZoomRotate.disable();
          renderMeasurement(sp.x1, sp.y1, sp.x2, sp.y2);
        }, HOLD_MS);
      } else {
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        startPosRef.current = null;
      }
    }

    function onTouchMove(e: TouchEvent) {
      if (activeRef.current) {
        if (e.touches.length === 2) {
          const t = e.touches;
          renderMeasurement(t[0].clientX, t[0].clientY, t[1].clientX, t[1].clientY);
        }
        return;
      }

      // Before activation: cancel if fingers move too far
      if (timerRef.current && startPosRef.current && e.touches.length === 2) {
        const sp = startPosRef.current;
        const t = e.touches;
        const d1 = Math.hypot(t[0].clientX - sp.x1, t[0].clientY - sp.y1);
        const d2 = Math.hypot(t[1].clientX - sp.x2, t[1].clientY - sp.y2);
        if (d1 > MOVE_TOLERANCE_PX || d2 > MOVE_TOLERANCE_PX) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
          startPosRef.current = null;
        }
      }
    }

    function onTouchEnd() {
      deactivate();
    }

    canvas.addEventListener("touchstart", onTouchStart, { passive: true });
    canvas.addEventListener("touchmove", onTouchMove, { passive: true });
    canvas.addEventListener("touchend", onTouchEnd);
    canvas.addEventListener("touchcancel", onTouchEnd);

    return () => {
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchend", onTouchEnd);
      canvas.removeEventListener("touchcancel", onTouchEnd);
      deactivate();
    };
  }, [map, mapLoaded]);
}
