import { createContext, useContext, useEffect, useState } from "react";

export interface Crew {
  id: number;
  name: string;
  start_number: number;
  description: string;
  track_color: string;
  track_length: number;
  race_committee: boolean;
  foto: string;
  boat_data: boolean;
  highlight?: boolean;
}

interface EventConfig {
  eventId: number | null;
  crews: Crew[];
  loading: boolean;
  error: string | null;
  highlightedCrews: Set<number>;
  toggleHighlight: (crewId: number) => void;
}

export const EventConfigContext = createContext<EventConfig>({
  eventId: null,
  crews: [],
  loading: true,
  error: null,
  highlightedCrews: new Set(),
  toggleHighlight: () => {},
});

export const useEventConfig = () => useContext(EventConfigContext);

export function useEventConfigLoader(): EventConfig {
  const [config, setConfig] = useState<EventConfig>({
    eventId: null,
    crews: [],
    loading: true,
    error: null,
  });

  useEffect(() => {
    const slug = import.meta.env.VITE_EVENT_SLUG || "vr-2026";

    fetch(`/api/event/${slug}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        setConfig({
          eventId: data.eventId,
          crews: data.crews,
          loading: false,
          error: null,
        });
      })
      .catch((err) => {
        setConfig((prev) => ({
          ...prev,
          loading: false,
          error: err.message,
        }));
      });
  }, []);

  return config;
}
