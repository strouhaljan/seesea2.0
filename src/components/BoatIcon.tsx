import React from "react";

interface BoatIconProps {
  color?: string;
  width?: number;
  height?: number;
  rotation?: number;
  className?: string;
}

const BoatIcon: React.FC<BoatIconProps> = ({
  color = "#392ABF", 
  width = 23, 
  height = 10,
  rotation = 0,
  className = "",
}) => {
  return (
    <svg 
      width={width} 
      height={height} 
      viewBox="0 0 23 10" 
      className={className}
      style={{
        filter: 'drop-shadow(0px 0px 3px white)',
        transform: `rotate(${rotation}deg)`,
        transformOrigin: 'center'
      }}
    >
      <path 
        d="M20.53,0.7c-3.03-0.58-9.87-1.39-14.7,0.37C1.03,2.82,0,5.27,0,5.27l0,0l0,0l0,0l0,0c0,0,1.03,2.45,5.83,4.2
        c4.83,1.76,11.67,0.95,14.7,0.37C21.43,9.67,23,9.39,23,7.28c0-1.61,0-2.02,0-2.02l0,0c0,0,0-0.4,0-2.02
        C23,1.15,21.43,0.87,20.53,0.7z" 
        style={{ fill: color }}
      />
    </svg>
  );
};

export default BoatIcon;