/**
 * Generates a deterministic color based on an object ID string
 * @param id String ID to generate color from
 * @returns Hex color string
 */
export function generateColorFromId(id: string): string {
  // Simple hash function to generate a number from a string
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  // Predefined color hues spread around the color wheel for better distinction
  const hues = [
    0,    // Red
    210,  // Blue
    120,  // Green
    280,  // Purple
    30,   // Orange
    180,  // Cyan
    330,  // Pink
    60,   // Yellow-Green
    240,  // Indigo
    160,  // Teal
    300,  // Magenta
    90,   // Lime
    270,  // Violet
    40,   // Amber
    200,  // Sky Blue
    340,  // Rose
    150,  // Sea Green
    20    // Gold
  ];
  
  // Pick a hue from the predefined list based on hash
  const h = hues[Math.abs(hash) % hues.length];
  
  // Vary saturation and lightness less to ensure good visibility
  const s = 75 + (Math.abs(hash >> 3) % 15); // Saturation (75-89%)
  const l = 50 + (Math.abs(hash >> 6) % 10); // Lightness (50-59%)
  
  return hslToHex(h, s, l);
}

/**
 * Converts HSL color values to hex string
 */
function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;

  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  
  return `#${f(0)}${f(8)}${f(4)}`;
}

/**
 * Generates an SVG sailboat icon from top view with custom color
 * @param id Object ID to base color on
 * @param rotation Rotation angle in degrees
 * @returns SVG string
 */
export function generateSailboatSvg(id: string, rotation: number = 0): string {
  const color = generateColorFromId(id);
  
  // Simplified boat shape from top view (just hull)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="32" height="32">
<g transform="rotate(${rotation}, 50, 50)">
<path d="M 35,35 L 65,35 L 75,50 L 65,65 L 35,65 L 25,50 Z" fill="${color}" stroke="#000" stroke-width="2"/>
<circle cx="50" cy="50" r="3" fill="#333"/>
</g>
</svg>`.trim();
}

/**
 * Creates a data URL from SVG content
 * @param svgContent SVG string
 * @returns Data URL for use in image src
 */
export function svgToDataUrl(svgContent: string): string {
  // Double-check that we're properly encoding
  const encoded = encodeURIComponent(svgContent)
    .replace(/'/g, '%27')
    .replace(/"/g, '%22');
    
  return `data:image/svg+xml;charset=utf-8,${encoded}`;
}