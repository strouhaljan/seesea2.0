import React from "react";

import { getDirection, getColorBySpeed } from "../utils/wind";
import type { ColorMode } from "./LiveMap";

interface BoatIconProps {
  highlight?: boolean;
  isOurs?: boolean;
  selected?: boolean;
  color?: string;
  colorMode?: ColorMode;
  rotation?: number;
  className?: string;
  windDirection?: number;
  windSpeed?: number;
  showWindArrow?: boolean;
  opacity?: number;
  label?: string;
  number?: number;
}

const BoatIcon: React.FC<BoatIconProps> = ({
  highlight = false,
  isOurs = false,
  selected = false,
  color = "#392ABF",
  colorMode = "seesea",
  rotation = 0,
  className = "",
  windDirection,
  windSpeed,
  showWindArrow = false,
  opacity = 1,
  label,
  number,
}) => {
  // Format wind speed to one decimal place if available
  const formattedWindSpeed =
    windSpeed != null ? windSpeed.toFixed(1) : "";

  // Calculate wind arrow rotation based on TWA if provided, otherwise use windDirection
  const arrowRotation =
    windDirection !== undefined && windDirection !== null
      ? getDirection(rotation || 0, windDirection)
      : undefined;

  const hullColor =
    colorMode === "wind" ? (getColorBySpeed(windSpeed) ?? color) : color;

  const iconSize = 36;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        filter: "none",
        opacity,
      }}
    >
      {/* Wind Speed - centered above icon */}
      {formattedWindSpeed && (
        <span
          style={{
            fontSize: "12px",
            fontWeight: "bold",
            color: "#fff",
            whiteSpace: "nowrap",
            lineHeight: 1,
          }}
        >
          {formattedWindSpeed}
        </span>
      )}

      {/* Future position label - centered above icon */}
      {label && (
        <span
          style={{
            fontSize: "10px",
            color: "rgba(255,255,255,0.7)",
            whiteSpace: "nowrap",
            lineHeight: 1,
          }}
        >
          {label}
        </span>
      )}

      {/* Boat icon with number overlay */}
      <div style={{ position: "relative", width: iconSize, height: iconSize }}>
        {/* Ring around the icon (doesn't rotate with the boat) */}
        {(selected || isOurs || highlight) && (
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              width: iconSize + 8,
              height: iconSize + 8,
              borderRadius: "50%",
              border: `2px solid ${selected ? "#22c55e" : isOurs ? "#00bfff" : "red"}`,
              pointerEvents: "none",
            }}
          />
        )}
        <svg
          width={iconSize}
          height={iconSize}
          viewBox="-0.5 -6.7 24 24"
          className={className}
          strokeWidth={1}
          fill={hullColor ?? "#fff"}
          style={{
            transform: `rotate(${rotation + 90}deg)`,
            transformOrigin: "center",
            display: "block",
          }}
        >
          {/* Boat shape */}
          <path
            d="M20.53,0.7c-3.03-0.58-9.87-1.39-14.7,0.37C1.03,2.82,0,5.27,0,5.27l0,0l0,0l0,0l0,0c0,0,1.03,2.45,5.83,4.2
          c4.83,1.76,11.67,0.95,14.7,0.37C21.43,9.67,23,9.39,23,7.28c0-1.61,0-2.02,0-2.02l0,0c0,0,0-0.4,0-2.02
          C23,1.15,21.43,0.87,20.53,0.7z"
          />
        </svg>

        {/* Vessel number - centered on icon */}
        {number != null && (
          <span
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              fontSize: "12px",
              fontWeight: "bold",
              color: "#fff",
              whiteSpace: "nowrap",
              pointerEvents: "none",
              lineHeight: 1,
              textShadow: "0 0 3px rgba(0,0,0,0.8)",
            }}
          >
            {number}
          </span>
        )}
      </div>

      {/* Wind Arrow - centered below icon */}
      {showWindArrow && arrowRotation !== undefined && (
        <span
          style={{
            transform: `rotate(${arrowRotation}deg)`,
            fontSize: "20px",
            color: "#fff",
            lineHeight: 1,
          }}
        >
          ↑
        </span>
      )}
    </div>
  );
};

export default BoatIcon;
