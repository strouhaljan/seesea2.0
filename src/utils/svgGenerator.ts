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
  
  // Convert to hex color with good saturation and brightness
  const h = Math.abs(hash) % 360; // Hue (0-359)
  const s = 70 + (Math.abs(hash) % 20); // Saturation (70-89%)
  const l = 45 + (Math.abs(hash) % 15); // Lightness (45-59%)
  
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
  
  // Basic sailboat shape from top view
  return `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="32" height="32">
    <g transform="rotate(${rotation}, 50, 50)">
      <!-- Hull -->
      <path d="M 35,30 L 65,30 L 70,50 L 60,70 L 40,70 L 30,50 Z" fill="${color}" stroke="#000" stroke-width="2"/>
      
      <!-- Mast -->
      <circle cx="50" cy="50" r="4" fill="#333"/>
      
      <!-- Main sail -->
      <path d="M 50,50 L 70,40 L 75,60 Z" fill="#f0f0f0" stroke="#333" stroke-width="1"/>
      
      <!-- Jib sail -->
      <path d="M 50,50 L 30,35 L 25,55 Z" fill="#f8f8f8" stroke="#333" stroke-width="1"/>
    </g>
  </svg>
  `.trim();
}

/**
 * Creates a data URL from SVG content
 * @param svgContent SVG string
 * @returns Data URL for use in image src
 */
export function svgToDataUrl(svgContent: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgContent)}`;
}