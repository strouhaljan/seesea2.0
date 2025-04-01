import React from 'react';
import { generateColorFromId } from "../utils/svgGenerator";

interface BoatMarkerProps {
  id: string;
  rotation: number;
  size?: number;
}

/**
 * A React component that renders a boat marker SVG
 */
const BoatMarker: React.FC<BoatMarkerProps> = ({ id, rotation, size = 32 }) => {
  const color = generateColorFromId(id);
  
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      viewBox="0 0 100 100" 
      width={size} 
      height={size}
      style={{ 
        filter: 'drop-shadow(0px 0px 3px white)',
        transform: `rotate(${rotation}deg)`, 
        transformOrigin: 'center'
      }}
    >
      {/* Hull */}
      <path 
        d="M 35,30 L 65,30 L 70,50 L 60,70 L 40,70 L 30,50 Z" 
        fill={color} 
        stroke="#000" 
        strokeWidth="2"
      />
      
      {/* Mast */}
      <circle 
        cx="50" 
        cy="50" 
        r="4" 
        fill="#333"
      />
      
      {/* Main sail */}
      <path 
        d="M 50,50 L 70,40 L 75,60 Z" 
        fill="#f0f0f0" 
        stroke="#333" 
        strokeWidth="1"
      />
      
      {/* Jib sail */}
      <path 
        d="M 50,50 L 30,35 L 25,55 Z" 
        fill="#f8f8f8" 
        stroke="#333" 
        strokeWidth="1"
      />
    </svg>
  );
};

export default BoatMarker;