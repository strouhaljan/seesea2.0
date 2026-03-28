export const MAP_STYLE = "mapbox://styles/mapbox/dark-v11";
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
