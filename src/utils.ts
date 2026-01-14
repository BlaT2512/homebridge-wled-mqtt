/**
 * Utility functions for color conversion and MQTT topic management
 */

/**
 * Convert HSV to RGB with Value (brightness) always at 100%
 * This ensures color changes don't affect brightness
 */
export function hsvToRgb(h: number, s: number): { r: number; g: number; b: number } {
  // Normalize hue to 0-360
  h = h % 360;
  if (h < 0) h += 360;

  // Normalize saturation to 0-1
  s = Math.max(0, Math.min(1, s));

  // Value is always 100% (1.0) for color calculations
  const v = 1.0;

  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;

  let r = 0, g = 0, b = 0;

  if (h >= 0 && h < 60) {
    r = c; g = x; b = 0;
  } else if (h >= 60 && h < 120) {
    r = x; g = c; b = 0;
  } else if (h >= 120 && h < 180) {
    r = 0; g = c; b = x;
  } else if (h >= 180 && h < 240) {
    r = 0; g = x; b = c;
  } else if (h >= 240 && h < 300) {
    r = x; g = 0; b = c;
  } else if (h >= 300 && h < 360) {
    r = c; g = 0; b = x;
  }

  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

/**
 * Convert RGB to HSV
 */
export function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  r = r / 255;
  g = g / 255;
  b = b / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === r) {
      h = ((g - b) / delta) % 6;
    } else if (max === g) {
      h = (b - r) / delta + 2;
    } else {
      h = (r - g) / delta + 4;
    }
  }
  h = Math.round(h * 60);
  if (h < 0) h += 360;

  const s = max === 0 ? 0 : delta / max;
  const v = max;

  return {
    h: Math.round(h),
    s: Math.round(s * 100),
    v: Math.round(v * 100),
  };
}

/**
 * Convert RGB to color temperature (mireds)
 * This is a simplified approximation
 */
export function rgbToColorTemperature(r: number, g: number, b: number): number {
  // Calculate correlated color temperature from RGB
  // This is a simplified approximation
  const n = (r * 0.299 + g * 0.587 + b * 0.114);
  const temp = n > 0.5 ? 2000 + (1 - n) * 3000 : 2000 + n * 3000;
  // Convert to mireds (inverse of kelvin * 1,000,000)
  const mireds = Math.round(1000000 / temp);
  // Clamp to valid HomeKit range (140-500 mireds)
  // Note: This function may return values outside this range for non-white colors
  // Callers should validate the result before using it
  return Math.max(140, Math.min(500, mireds));
}

/**
 * Convert color temperature (mireds) to RGB
 */
export function colorTemperatureToRgb(mireds: number): { r: number; g: number; b: number } {
  // Clamp mireds to valid range
  mireds = Math.max(50, Math.min(500, mireds));
  const kelvin = 1000000 / mireds;

  // Calculate RGB from color temperature (Planckian locus approximation)
  let r, g, b;

  if (kelvin < 6600) {
    r = 255;
    g = kelvin / 100 - 2;
    g = -155.25485562709179 - 0.44596950469579133 * g + 104.49216199393888 * Math.log(g);
    b = kelvin < 2000 ? 0 : kelvin / 100 - 10;
    b = -254.76935184120902 + 0.8274096064007395 * b + 115.67994401066147 * Math.log(b);
  } else {
    r = kelvin / 100 - 55;
    r = 351.97690566805693 + 0.114206453784165 * r - 40.25366309332127 * Math.log(r);
    g = kelvin / 100 - 50;
    g = 325.4494125711974 + 0.07943456536662342 * g - 28.0852963507957 * Math.log(g);
    b = 255;
  }

  return {
    r: Math.max(0, Math.min(255, Math.round(r))),
    g: Math.max(0, Math.min(255, Math.round(g))),
    b: Math.max(0, Math.min(255, Math.round(b))),
  };
}

/**
 * Convert RGB to hex string
 */
export function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(x => {
    const hex = x.toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
}

/**
 * Parse hex string to RGB
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  } : null;
}
