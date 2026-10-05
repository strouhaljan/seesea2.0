import { useCallback, useEffect, useRef } from "react";
import { VesselDataPoint } from "../types/tripData";
import { Crew } from "../hooks/useEventConfig";
import { FleetStats } from "../hooks/useFleetStats";
import BoatList from "./BoatList";

interface BoatPanelProps {
  crews: Crew[];
  vesselsData: Record<string, VesselDataPoint>;
  stats: FleetStats;
  activeBoatId: number | null;
  followedBoatId: number | null;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onSelect: (crewId: number) => void;
}

const SWIPE_THRESHOLD = 50;
const EDGE_ZONE = 30;

/** Desktop side panel around the boat list, with edge-swipe open/close. */
const BoatPanel = ({ collapsed, onToggleCollapsed, ...listProps }: BoatPanelProps) => {
  const touchRef = useRef<{ startX: number; startY: number; isEdge: boolean } | null>(null);

  // Edge swipe to open: listen on document
  const handleDocTouchStart = useCallback((e: TouchEvent) => {
    const touch = e.touches[0];
    if (touch.clientX <= EDGE_ZONE) {
      touchRef.current = { startX: touch.clientX, startY: touch.clientY, isEdge: true };
    }
  }, []);

  const handleDocTouchEnd = useCallback((e: TouchEvent) => {
    const ref = touchRef.current;
    if (!ref?.isEdge) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - ref.startX;
    const dy = Math.abs(touch.clientY - ref.startY);
    touchRef.current = null;
    if (dx > SWIPE_THRESHOLD && dx > dy && collapsed) onToggleCollapsed();
  }, [collapsed, onToggleCollapsed]);

  useEffect(() => {
    document.addEventListener("touchstart", handleDocTouchStart, { passive: true });
    document.addEventListener("touchend", handleDocTouchEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", handleDocTouchStart);
      document.removeEventListener("touchend", handleDocTouchEnd);
    };
  }, [handleDocTouchStart, handleDocTouchEnd]);

  // Swipe left on panel to close
  const handlePanelTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchRef.current = { startX: touch.clientX, startY: touch.clientY, isEdge: false };
  }, []);

  const handlePanelTouchEnd = useCallback((e: React.TouchEvent) => {
    const ref = touchRef.current;
    if (!ref || ref.isEdge) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - ref.startX;
    const dy = Math.abs(touch.clientY - ref.startY);
    touchRef.current = null;
    if (dx < -SWIPE_THRESHOLD && Math.abs(dx) > dy && !collapsed) onToggleCollapsed();
  }, [collapsed, onToggleCollapsed]);

  if (listProps.crews.length === 0) return null;

  return (
    <div
      className={`boat-panel ${collapsed ? "boat-panel--collapsed" : ""}`}
      onTouchStart={handlePanelTouchStart}
      onTouchEnd={handlePanelTouchEnd}
    >
      <BoatList {...listProps} />
    </div>
  );
};

export default BoatPanel;
