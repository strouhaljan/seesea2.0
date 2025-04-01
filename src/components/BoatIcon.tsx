import React from "react";

// Function to get color based on wind speed
export const getWindSpeedColor = (windSpeed: number): string => {
  if (windSpeed <= 0) return "#000000"; // Black for no wind
  
  if (windSpeed < 5) return "#00bfff"; // Light blue for light wind
  if (windSpeed < 10) return "#0080ff"; // Medium blue for moderate wind
  if (windSpeed < 15) return "#00ff80"; // Light green
  if (windSpeed < 20) return "#00c000"; // Medium green
  if (windSpeed < 25) return "#ffd700"; // Yellow
  if (windSpeed < 30) return "#ff8c00"; // Orange
  if (windSpeed < 35) return "#ff4500"; // Orange-red
  
  return "#ff0000"; // Red for strong wind
};

const getWindDirection = (heading: number, windDirection: number) => {
  if (heading === undefined || windDirection === undefined || 
      heading === null || windDirection === null) {
    return undefined;
  }

  // Calculate wind direction based on heading and wind direction
  let windHeading = windDirection + heading + 180;
  
  // Normalize negative values
  if (windHeading < 0) {
    windHeading += 360;
  }

  return windHeading;
};

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
  heading?: number;
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
  windArrowColor = "#000000",
  heading,
}) => {
  if (!rotation) {
    return null;
  }
  // Calculate total height to accommodate the wind arrow and speed label
  const totalHeight =
    showWindArrow && windDirection !== undefined ? height * 2.5 : height;

  // Format wind speed to one decimal place if available
  const formattedWindSpeed =
    windSpeed !== undefined ? windSpeed.toFixed(1) : "";

  // Calculate wind arrow rotation based on TWA if provided, otherwise use windDirection
  const arrowRotation = (windDirection !== undefined && windDirection !== null) ? 
    getWindDirection(rotation || 0, windDirection) : undefined;

  return (
    <div style={{ position: "relative" }}>
      <svg
        width={width}
        height={totalHeight}
        viewBox={`0 0 23 ${totalHeight}`}
        className={className}
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
          style={{ fill: color }}
        />
      </svg>

      {/* Wind Arrow - now using TWA for rotation if available */}
      {showWindArrow && arrowRotation !== undefined && (
        <div
          style={{
            position: "absolute",
            top: "16px",
            left: "5px",
            transform: `rotate(${arrowRotation}deg)`,
            fontSize: "24px",
            fontWeight: "bold",
            color: windArrowColor,
          }}
        >
          {/*{arrowRotation}*/}
          <span>↑</span>
        </div>
      )}

      {/* Wind Speed - colored by wind speed gradient */}
      {formattedWindSpeed && (
        <span
          style={{
            position: "absolute",
            top: "0",
            left: "5px",
            fontSize: "24px",
            fontWeight: "bold",
            color: getWindSpeedColor(Number(windSpeed) || 0),
          }}
        >
          {formattedWindSpeed}
        </span>
      )}
    </div>
  );
};

export default BoatIcon;
