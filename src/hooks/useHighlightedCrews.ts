import { useCallback, useState } from "react";

const STORAGE_KEY = "seesea-highlighted-crews";

function loadHighlighted(): Set<number> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as number[]);
  } catch {
    return new Set();
  }
}

function saveHighlighted(ids: Set<number>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
}

export function useHighlightedCrews() {
  const [highlightedCrews, setHighlightedCrews] = useState<Set<number>>(loadHighlighted);

  const toggleHighlight = useCallback((crewId: number) => {
    setHighlightedCrews((prev) => {
      const next = new Set(prev);
      if (next.has(crewId)) {
        next.delete(crewId);
      } else {
        next.add(crewId);
      }
      saveHighlighted(next);
      return next;
    });
  }, []);

  return { highlightedCrews, toggleHighlight };
}
