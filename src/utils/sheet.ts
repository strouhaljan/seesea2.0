export type SheetSnap = "bar" | "half" | "full";

export const SHEET_SNAPS: SheetSnap[] = ["bar", "half", "full"];
/** Handle plus the search/sort row. */
const BAR_PX = 76;
const SNAP_FRACTION = { half: 0.45, full: 0.85 };

/** Height of the phone boat sheet at a snap point, in px. */
export function sheetHeight(snap: SheetSnap, viewport = window.innerHeight): number {
  return snap === "bar" ? BAR_PX : Math.round(viewport * SNAP_FRACTION[snap]);
}
