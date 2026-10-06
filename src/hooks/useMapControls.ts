import { useEffect, useState } from "react";
import { ColorMode } from "../types/map";
import { getSavedTheme, saveTheme, MapTheme } from "../utils/mapConfig";
import { WindModel } from "../utils/windGrid";
import { useEventConfig } from "./useEventConfig";

export function useMapControls() {
  const { slug } = useEventConfig();
  const legKey = `selectedLegId:${slug}`;
  const [selectedLegId, setSelectedLegId] = useState<number | null>(
    () => {
      const saved = localStorage.getItem(legKey);
      return saved ? parseInt(saved, 10) : null;
    }
  );
  const [colorMode, setColorMode] = useState<ColorMode>(
    () => (localStorage.getItem("colorMode") as ColorMode) || "seesea"
  );
  const [showOnlyHighlighted, setShowOnlyHighlighted] = useState(
    () => localStorage.getItem("showOnlyHighlighted") === "true"
  );
  const [showWind, setShowWind] = useState(
    () => localStorage.getItem("showWind") === "true"
  );
  const [windModel, setWindModel] = useState<WindModel>(
    () => (localStorage.getItem("windModel") as WindModel) || "icon_2i"
  );
  const [blendBoats, setBlendBoats] = useState(
    () => localStorage.getItem("blendBoats") === "true"
  );
  const [futureMinutes, setFutureMinutes] = useState(
    () => parseInt(localStorage.getItem("futureMinutes") || "0", 10)
  );
  const [trailMinutes, setTrailMinutes] = useState(
    () => parseInt(localStorage.getItem("trailMinutes") || "0", 10)
  );
  const [mapTheme, setMapTheme] = useState<MapTheme>(getSavedTheme);

  useEffect(() => {
    if (selectedLegId !== null) {
      localStorage.setItem(legKey, String(selectedLegId));
    } else {
      localStorage.removeItem(legKey);
    }
    window.dispatchEvent(new Event("selectedLegChanged"));
  }, [selectedLegId, legKey]);
  useEffect(() => {
    localStorage.setItem("colorMode", colorMode);
    window.dispatchEvent(new Event("colorModeChanged"));
  }, [colorMode]);
  useEffect(() => { localStorage.setItem("showOnlyHighlighted", String(showOnlyHighlighted)); }, [showOnlyHighlighted]);
  useEffect(() => { localStorage.setItem("showWind", String(showWind)); }, [showWind]);
  useEffect(() => { localStorage.setItem("windModel", windModel); }, [windModel]);
  useEffect(() => { localStorage.setItem("blendBoats", String(blendBoats)); }, [blendBoats]);
  useEffect(() => { localStorage.setItem("futureMinutes", String(futureMinutes)); }, [futureMinutes]);
  useEffect(() => {
    localStorage.setItem("trailMinutes", String(trailMinutes));
    window.dispatchEvent(new Event("trailMinutesChanged"));
  }, [trailMinutes]);
  useEffect(() => {
    saveTheme(mapTheme);
    document.documentElement.setAttribute("data-theme", mapTheme);
  }, [mapTheme]);

  return {
    selectedLegId, setSelectedLegId,
    colorMode, setColorMode,
    showOnlyHighlighted, setShowOnlyHighlighted,
    showWind, setShowWind,
    windModel, setWindModel,
    blendBoats, setBlendBoats,
    futureMinutes, setFutureMinutes,
    trailMinutes, setTrailMinutes,
    mapTheme, setMapTheme,
  };
}

export type MapControlsState = ReturnType<typeof useMapControls>;
