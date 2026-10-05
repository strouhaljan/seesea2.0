import { useMemo } from "react";
import type { Crew } from "./useEventConfig";
import type { LegMarker } from "./useLegMarkers";
import type { VesselDataPoint } from "../types/tripData";
import { distanceNm } from "../utils/distance";

export interface FleetStats {
  /** Distance to the finish mark in nm, per crew id. */
  dtf: Map<number, number>;
  /** 1-based place by distance to finish, per crew id. */
  position: Map<number, number>;
  /** The leg has a finish mark. */
  hasFinish: boolean;
}

export function useFleetStats(
  crews: Crew[],
  vesselsData: Record<string, VesselDataPoint>,
  legMarkers: LegMarker[],
): FleetStats {
  const finishMark = useMemo(() => legMarkers.find((m) => m.marker_type === "finish"), [legMarkers]);

  const dtf = useMemo(() => {
    const map = new Map<number, number>();
    if (!finishMark) return map;
    const finishCoords: [number, number] = [finishMark.lon, finishMark.lat];
    for (const crew of crews) {
      const data = vesselsData[String(crew.id)];
      if (data?.coords) map.set(crew.id, distanceNm(data.coords, finishCoords));
    }
    return map;
  }, [crews, vesselsData, finishMark]);

  const position = useMemo(() => {
    const map = new Map<number, number>();
    [...dtf.entries()].sort((a, b) => a[1] - b[1]).forEach(([crewId], i) => map.set(crewId, i + 1));
    return map;
  }, [dtf]);

  return { dtf, position, hasFinish: finishMark != null };
}

export function formatDistanceNm(nm: number): string {
  return nm < 1 ? `${(nm * 1852).toFixed(0)} m` : `${nm.toFixed(1)} nm`;
}
