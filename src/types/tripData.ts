export interface VesselDataPoint {
  coords: [number, number]; // [longitude, latitude]
  time: number; // Unix timestamp
  sog: number; // Speed over ground (knots)
  cog: number; // Course over ground (degrees)
  hdg: number; // Heading (degrees)
  twa: number; // True wind angle
  tws: number; // True wind speed
  awa: number; // Apparent wind angle
  aws: number; // Apparent wind speed
  dpt: number; // Depth
  mtw: number; // Water temperature
  alt: number; // Altitude
  stw: number; // Speed through water
  // ... other properties as needed
}

export interface TripData {
  sample: number;
  to: number;
  objects: {
    [key: string]: VesselDataPoint[];
  };
}