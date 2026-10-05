import { ReactNode, useEffect, useRef, useState } from "react";
import { SHEET_SNAPS as ORDER, SheetSnap, sheetHeight } from "../utils/sheet";

const TAP_SLOP_PX = 6;
/** Release speed (px/ms) that counts as a flick to the next height. */
const FLICK_PX_PER_MS = 0.5;

interface BottomSheetProps {
  snap: SheetSnap;
  onSnapChange: (snap: SheetSnap) => void;
  children: ReactNode;
}

/** Draggable bottom sheet with three heights (phones). Tap the handle to toggle bar ↔ half. */
export default function BottomSheet({ snap, onSnapChange, children }: BottomSheetProps) {
  const [viewport, setViewport] = useState(() => window.innerHeight);
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const drag = useRef<{ startY: number; startH: number; lastY: number; lastT: number; v: number } | null>(null);

  useEffect(() => {
    const onResize = () => setViewport(window.innerHeight);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const heights = ORDER.map((s) => sheetHeight(s, viewport));
  const height = dragHeight ?? sheetHeight(snap, viewport);

  const onPointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { startY: e.clientY, startH: height, lastY: e.clientY, lastT: e.timeStamp, v: 0 };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dt = e.timeStamp - d.lastT;
    if (dt > 0) d.v = (d.lastY - e.clientY) / dt; // positive = upwards
    d.lastY = e.clientY;
    d.lastT = e.timeStamp;
    if (dragHeight === null && Math.abs(e.clientY - d.startY) < TAP_SLOP_PX) return;
    setDragHeight(Math.max(heights[0], Math.min(heights[2], d.startH + (d.startY - e.clientY))));
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    setDragHeight(null);
    if (Math.abs(e.clientY - d.startY) < TAP_SLOP_PX) {
      onSnapChange(snap === "bar" ? "half" : "bar");
      return;
    }
    const h = d.startH + (d.startY - e.clientY);
    let next: number;
    if (Math.abs(d.v) > FLICK_PX_PER_MS) {
      next = ORDER.indexOf(snap) + Math.sign(d.v);
    } else {
      next = heights.reduce((best, x, i) => (Math.abs(x - h) < Math.abs(heights[best] - h) ? i : best), 0);
    }
    onSnapChange(ORDER[Math.max(0, Math.min(ORDER.length - 1, next))]);
  };

  return (
    <div className={`bottom-sheet ${dragHeight !== null ? "bottom-sheet--dragging" : ""}`} style={{ height }}>
      <div
        className="bottom-sheet__handle"
        role="button"
        aria-label={snap === "bar" ? "Show boats" : "Hide boats"}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div className="bottom-sheet__grip" />
      </div>
      <div className="bottom-sheet__content">{children}</div>
    </div>
  );
}
