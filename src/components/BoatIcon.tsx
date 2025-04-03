import React from "react";

import { crewList } from "../crewList";
import { getDirection, getColorBySpeed } from "../utils/wind";

interface BoatIconProps {
  crewId?: number;
  color?: string;
  width?: number;
  height?: number;
  rotation?: number;
  className?: string;
  windDirection?: number;
  windSpeed?: number;
  showWindArrow?: boolean;
  windArrowColor?: string;
  heading?: number;
}

const BoatIcon: React.FC<BoatIconProps> = ({
  crewId,
  color = "#392ABF",
  width = 23,
  height = 10,
  rotation = 0,
  className = "",
  windDirection,
  windSpeed,
  showWindArrow = false,
  windArrowColor = "#000000",
  heading,
}) => {
  if (!rotation) {
    return null;
  }
  // Format wind speed to one decimal place if available
  const formattedWindSpeed =
    windSpeed !== undefined ? windSpeed.toFixed(1) : "";

  // Calculate wind arrow rotation based on TWA if provided, otherwise use windDirection
  const arrowRotation =
    windDirection !== undefined && windDirection !== null
      ? getDirection(rotation || 0, windDirection)
      : undefined;

  const hullColor = getColorBySpeed(windSpeed);

  return (
    <div style={{ position: "relative" }}>
      <svg
        width={24}
        height={24}
        viewBox={`0 0 24 24`}
        className={className}
        strokeWidth={1}
        fill={hullColor ?? "#fff"}
        style={{
          transform: `rotate(${rotation + 90}deg)`,
          transformOrigin: "center",
        }}
      >
        {/* Boat shape */}
        <path
          d="M20.53,0.7c-3.03-0.58-9.87-1.39-14.7,0.37C1.03,2.82,0,5.27,0,5.27l0,0l0,0l0,0l0,0c0,0,1.03,2.45,5.83,4.2
        c4.83,1.76,11.67,0.95,14.7,0.37C21.43,9.67,23,9.39,23,7.28c0-1.61,0-2.02,0-2.02l0,0c0,0,0-0.4,0-2.02
        C23,1.15,21.43,0.87,20.53,0.7z"
        />
        {/* Highlight */}
        {crewList.find((crew) => crew.id === crewId)?.highlight ? (
          <circle r="5" cx="12" cy="12" fill="red" />
        ) : null}
      </svg>

      {/* Wind Arrow - now using TWA for rotation if available */}
      {showWindArrow && arrowRotation !== undefined && (
        <div
          style={{
            position: "absolute",
            top: "32px",
            left: "0px",
            transform: `rotate(${arrowRotation}deg)`,
            fontSize: "32px",
            color: "#fff",
          }}
        >
          <span>↑</span>
        </div>
      )}

      {/* Wind Speed - colored by wind speed gradient */}
      {formattedWindSpeed && (
        <span
          style={{
            position: "absolute",
            top: "-24px",
            left: "0px",
            fontSize: "16px",
            fontWeight: "bold",
            color: "#fff",
          }}
        >
          {formattedWindSpeed}
        </span>
      )}
    </div>
  );
};

export default BoatIcon;
