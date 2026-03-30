export type MapTheme = "dark" | "light";

export const MAP_STYLES: Record<MapTheme, string> = {
  dark: "mapbox://styles/mapbox/dark-v11",
  light: "mapbox://styles/mapbox/outdoors-v12",
};

const THEME_STORAGE_KEY = "seesea-map-theme";

export const getSavedTheme = (): MapTheme =>
  (localStorage.getItem(THEME_STORAGE_KEY) as MapTheme) || "dark";

export const saveTheme = (theme: MapTheme): void =>
  localStorage.setItem(THEME_STORAGE_KEY, theme);
export const DEFAULT_CENTER: [number, number] = [15.5, 43.8];
export const DEFAULT_ZOOM = 9;
export const CENTER_VESSEL_ID = "201503116";

const ZOOM_STORAGE_KEY = "seesea-map-zoom";

export const getSavedZoom = (): number => {
  const saved = localStorage.getItem(ZOOM_STORAGE_KEY);
  return saved ? parseFloat(saved) : DEFAULT_ZOOM;
};

export const saveZoom = (zoom: number): void => {
  localStorage.setItem(ZOOM_STORAGE_KEY, String(zoom));
};
