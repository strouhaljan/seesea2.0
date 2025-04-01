import React from "react";

interface BoatIconProps {
  color?: string;
  width?: number;
  height?: number;
  rotation?: number;
  className?: string;
  windDirection?: number;
  windSpeed?: number;
  showWindArrow?: boolean;
  windArrowColor?: string;
}

const BoatIcon: React.FC<BoatIconProps> = ({
  color = "#392ABF",
  width = 23,
  height = 10,
  rotation = 0,
  className = "",
  windDirection,
  windSpeed,
  showWindArrow = false,
}) => {
  // Calculate total height to accommodate the wind arrow and speed label
  const totalHeight =
    showWindArrow && windDirection !== undefined ? height * 2.5 : height;

  // Format wind speed to one decimal place if available
  const formattedWindSpeed =
    windSpeed !== undefined ? windSpeed.toFixed(1) : "";

  return (
    <div style={{ position: "relative" }}>
      <svg
        width={width}
        height={totalHeight}
        viewBox={`0 0 23 ${totalHeight}`}
        className={className}
        style={{
          transform: `rotate(${rotation}deg)`,
          transformOrigin: "center",
        }}
      >
        {/* Boat shape */}
        <path
          d="M20.53,0.7c-3.03-0.58-9.87-1.39-14.7,0.37C1.03,2.82,0,5.27,0,5.27l0,0l0,0l0,0l0,0c0,0,1.03,2.45,5.83,4.2
        c4.83,1.76,11.67,0.95,14.7,0.37C21.43,9.67,23,9.39,23,7.28c0-1.61,0-2.02,0-2.02l0,0c0,0,0-0.4,0-2.02
        C23,1.15,21.43,0.87,20.53,0.7z"
          style={{ fill: color }}
        />
      </svg>
      {showWindArrow && !!windDirection && (
        <div
          style={{
            position: "absolute",
            top: "16px",
            left: "5px",
            transform: `rotate(${windDirection}deg)`,
            fontSize: "24px",
            fontWeight: "bold",
          }}
        >
          <span>↑</span>
        </div>
      )}
      {formattedWindSpeed && (
        <span
          style={{
            position: "absolute",
            top: "0",
            left: "5px",
            fontSize: "24px",
            fontWeight: "bold",
          }}
        >
          {formattedWindSpeed}
        </span>
      )}
    </div>
  );
};

export default BoatIcon;
