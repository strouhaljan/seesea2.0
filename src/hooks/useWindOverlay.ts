import { useEffect, useRef, MutableRefObject } from "react";
import { Map as MapboxMap } from "mapbox-gl";
import { WindOverlay } from "../components/WindOverlay";
import { fetchWindGrids, blendBoatData, lerpGrids, WindModel } from "../utils/windGrid";
import { VesselDataPoint } from "../types/tripData";

interface UseWindOverlayOptions {
  showWind: boolean;
  windModel: WindModel;
  blendBoats: boolean;
  vesselsData: Record<string, VesselDataPoint>;
  isHistoryMode: boolean;
  futureMinutes: number;
}

export function useWindOverlay(
  map: MutableRefObject<MapboxMap | null>,
  mapLoaded: boolean,
  options: UseWindOverlayOptions,
) {
  const { showWind, windModel, blendBoats, vesselsData, isHistoryMode, futureMinutes } = options;
  const windOverlayRef = useRef<WindOverlay | null>(null);

  useEffect(() => {
    if (!mapLoaded || !map.current || !showWind || isHistoryMode) {
      windOverlayRef.current?.hide();
      return;
    }

    let refreshInterval: ReturnType<typeof setInterval>;

    const loadGrid = async () => {
      try {
        const grids = await fetchWindGrids(windModel);
        let grid = grids[0];
        if (futureMinutes > 0 && grids.length > 1) {
          const hours = futureMinutes / 60;
          const idx = Math.min(Math.floor(hours), grids.length - 2);
          const t = hours - idx;
          grid = lerpGrids(grids[idx], grids[idx + 1], t);
        }
        if (blendBoats && Object.keys(vesselsData).length > 0) {
          grid = blendBoatData(grid, vesselsData);
        }
        if (!map.current) return;
        if (!windOverlayRef.current) {
          windOverlayRef.current = new WindOverlay(map.current, grid);
        } else {
          windOverlayRef.current.updateGrid(grid);
        }
        windOverlayRef.current.showBarbs = futureMinutes > 0;
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
  }, [mapLoaded, showWind, windModel, blendBoats, vesselsData, isHistoryMode, futureMinutes]);

  // Cleanup on unmount
  useEffect(() => {
    return () => { windOverlayRef.current?.destroy(); };
  }, []);

  return windOverlayRef;
}
