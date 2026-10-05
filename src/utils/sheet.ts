export type SheetSnap = "bar" | "half" | "full";

export const SHEET_SNAPS: SheetSnap[] = ["bar", "half", "full"];
/** 36 px handle plus the search/sort row (excluding the iOS home-indicator inset). */
const BAR_PX = 90;
const SNAP_FRACTION = { half: 0.45, full: 0.85 };

/** Height of the phone boat sheet at a snap point, in px. */
export function sheetHeight(snap: SheetSnap, viewport = window.innerHeight): number {
  return snap === "bar" ? BAR_PX : Math.round(viewport * SNAP_FRACTION[snap]);
}

/** Bottom safe-area inset in px (iPhone home indicator), resolved from the `--safe-bottom` CSS variable. */
export function safeAreaBottom(): number {
  const probe = document.createElement("div");
  probe.style.cssText = "position:absolute;visibility:hidden;padding-bottom:var(--safe-bottom, 0px)";
  document.body.appendChild(probe);
  const px = parseFloat(getComputedStyle(probe).paddingBottom) || 0;
  probe.remove();
  return px;
}
