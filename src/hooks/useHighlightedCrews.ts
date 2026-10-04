import { useCallback, useEffect, useState } from "react";
import { HIGHLIGHTED_BOATS } from "../config";
import type { Crew } from "./useEventConfig";

const STORAGE_PREFIX = "seesea-highlighted-crews:";

/** Saved highlights for an event, or null if the event was never opened. */
function loadHighlighted(key: string): Set<number> | null {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? null : new Set(JSON.parse(raw) as number[]);
  } catch {
    return null;
  }
}

function saveHighlighted(key: string, ids: Set<number>) {
  localStorage.setItem(key, JSON.stringify([...ids]));
}

export function useHighlightedCrews(slug: string, crews: Crew[]) {
  const key = STORAGE_PREFIX + slug;
  const [highlightedCrews, setHighlightedCrews] = useState<Set<number>>(
    () => loadHighlighted(key) ?? new Set(),
  );

  // First visit to this event: seed the default boats once its crews are known
  useEffect(() => {
    if (crews.length === 0 || loadHighlighted(key) !== null) return;
    const seeded = new Set(crews.filter((c) => HIGHLIGHTED_BOATS.includes(c.name)).map((c) => c.id));
    saveHighlighted(key, seeded);
    setHighlightedCrews(seeded);
  }, [crews, key]);

  const toggleHighlight = useCallback((crewId: number) => {
    setHighlightedCrews((prev) => {
      const next = new Set(prev);
      if (next.has(crewId)) {
        next.delete(crewId);
      } else {
        next.add(crewId);
      }
      saveHighlighted(key, next);
      return next;
    });
  }, [key]);

  return { highlightedCrews, toggleHighlight };
}
