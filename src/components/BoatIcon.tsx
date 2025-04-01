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
  windArrowColor = "#70B5FF"
}) => {
  // Calculate total height to accommodate the wind arrow and speed label
  const totalHeight = showWindArrow && windDirection !== undefined ? height * 2.5 : height;
  const arrowHeight = height * 0.8;
  
  // Format wind speed to one decimal place if available
  const formattedWindSpeed = windSpeed !== undefined ? windSpeed.toFixed(1) : "";
  
  return (
    <svg 
      width={width} 
      height={totalHeight} 
      viewBox={`0 0 23 ${totalHeight}`}
      className={className}
      style={{
        filter: 'drop-shadow(0px 0px 3px white)',
        transform: `rotate(${rotation}deg)`,
        transformOrigin: 'center'
      }}
    >
      {/* Boat shape */}
      <path 
        d="M20.53,0.7c-3.03-0.58-9.87-1.39-14.7,0.37C1.03,2.82,0,5.27,0,5.27l0,0l0,0l0,0l0,0c0,0,1.03,2.45,5.83,4.2
        c4.83,1.76,11.67,0.95,14.7,0.37C21.43,9.67,23,9.39,23,7.28c0-1.61,0-2.02,0-2.02l0,0c0,0,0-0.4,0-2.02
        C23,1.15,21.43,0.87,20.53,0.7z" 
        style={{ fill: color }}
      />
      
      {/* Wind direction arrow */}
      {showWindArrow && windDirection !== undefined && (
        <g 
          transform={`translate(11.5, ${height}) rotate(${windDirection}, 0, 0)`}
          style={{ transformOrigin: 'center' }}
        >
          <line 
            x1="0" 
            y1="0" 
            x2="0" 
            y2={-arrowHeight} 
            stroke={windArrowColor} 
            strokeWidth="1.5"
          />
          <polygon 
            points={`0,${-arrowHeight-3} -3,${-arrowHeight+1} 3,${-arrowHeight+1}`} 
            fill={windArrowColor}
          />
        </g>
      )}
      
      {/* Wind speed indicator */}
      {showWindArrow && windSpeed !== undefined && (
        <g transform={`rotate(${-rotation})`} style={{ transformOrigin: 'center' }}>
          <rect
            x={(width/2) - 8}
            y={height + arrowHeight + 2}
            width="16"
            height="10"
            rx="3"
            fill="white"
            fillOpacity="0.8"
            stroke={windArrowColor}
            strokeWidth="0.5"
          />
          <text
            x={width/2}
            y={height + arrowHeight + 9}
            textAnchor="middle"
            fontSize="7"
            fontWeight="bold"
            fill={windArrowColor}
            style={{ pointerEvents: 'none' }}
          >
            {formattedWindSpeed}
          </text>
        </g>
      )}
    </svg>
  );
};

export default BoatIcon;