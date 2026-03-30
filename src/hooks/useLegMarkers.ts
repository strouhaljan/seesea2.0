import { useEffect, useState } from "react";

export interface LegMarker {
  id: number;
  marker_type: "start" | "finish" | "line" | "buoy" | "dtf";
  name: string;
  lat: number;
  lon: number;
  lat_2: number | null;
  lon_2: number | null;
}

export function useLegMarkers(
  eventId: number | null,
  legId: number | null,
): LegMarker[] {
  const [markers, setMarkers] = useState<LegMarker[]>([]);

  useEffect(() => {
    if (!eventId || !legId) return;

    fetch(`/api/leg/${eventId}/${legId}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: LegMarker[]) => setMarkers(data))
      .catch((err) => console.error("Failed to fetch leg markers:", err));
  }, [eventId, legId]);

  return markers;
}
