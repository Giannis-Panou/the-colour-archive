// Colour maths for filtering, sorting and matching mixes. Colours are "#rrggbb" sRGB strings.

export interface Lab { l: number; a: number; b: number }

export function hexToRgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1, 7), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** Hue in degrees (0–360), saturation and lightness (0–1). */
export function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const [r, g, b] = hexToRgb(hex).map((channel) => channel / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return { h: h < 0 ? h + 360 : h, s, l };
}

/** CIE L*a*b* (D65), the space colour differences are measured in. */
export function hexToLab(hex: string): Lab {
  const linear = hexToRgb(hex).map((channel) => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const [r, g, b] = linear;
  const x = (r * 0.4124564 + g * 0.3575761 + b * 0.1804375) / 0.95047;
  const y = r * 0.2126729 + g * 0.7151522 + b * 0.072175;
  const z = (r * 0.0193339 + g * 0.119192 + b * 0.9503041) / 1.08883;
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const [fx, fy, fz] = [f(x), f(y), f(z)];
  return { l: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
const toDegrees = (radians: number) => (radians * 180) / Math.PI;

/**
 * CIEDE2000 colour difference: how different two colours look to a person.
 * Under 1 is invisible, around 2 is a close match, over 10 is clearly a different colour.
 */
export function deltaE2000(first: Lab, second: Lab): number {
  const { l: l1, a: a1, b: b1 } = first;
  const { l: l2, a: a2, b: b2 } = second;
  const c1 = Math.hypot(a1, b1);
  const c2 = Math.hypot(a2, b2);
  const cMean = (c1 + c2) / 2;
  const g = 0.5 * (1 - Math.sqrt(cMean ** 7 / (cMean ** 7 + 25 ** 7)));
  const a1p = (1 + g) * a1;
  const a2p = (1 + g) * a2;
  const c1p = Math.hypot(a1p, b1);
  const c2p = Math.hypot(a2p, b2);
  const hue = (a: number, b: number) => {
    if (a === 0 && b === 0) return 0;
    const angle = toDegrees(Math.atan2(b, a));
    return angle < 0 ? angle + 360 : angle;
  };
  const h1p = hue(a1p, b1);
  const h2p = hue(a2p, b2);

  const dLp = l2 - l1;
  const dCp = c2p - c1p;
  let dhp = 0;
  if (c1p * c2p !== 0) {
    dhp = h2p - h1p;
    if (dhp > 180) dhp -= 360;
    else if (dhp < -180) dhp += 360;
  }
  const dHp = 2 * Math.sqrt(c1p * c2p) * Math.sin(toRadians(dhp / 2));

  const lMean = (l1 + l2) / 2;
  const cMeanP = (c1p + c2p) / 2;
  let hMean = h1p + h2p;
  if (c1p * c2p !== 0) {
    if (Math.abs(h1p - h2p) <= 180) hMean /= 2;
    else hMean = h1p + h2p < 360 ? (hMean + 360) / 2 : (hMean - 360) / 2;
  }
  const t = 1
    - 0.17 * Math.cos(toRadians(hMean - 30))
    + 0.24 * Math.cos(toRadians(2 * hMean))
    + 0.32 * Math.cos(toRadians(3 * hMean + 6))
    - 0.2 * Math.cos(toRadians(4 * hMean - 63));
  const dTheta = 30 * Math.exp(-(((hMean - 275) / 25) ** 2));
  const rc = 2 * Math.sqrt(cMeanP ** 7 / (cMeanP ** 7 + 25 ** 7));
  const sl = 1 + (0.015 * (lMean - 50) ** 2) / Math.sqrt(20 + (lMean - 50) ** 2);
  const sc = 1 + 0.045 * cMeanP;
  const sh = 1 + 0.015 * cMeanP * t;
  const rt = -Math.sin(toRadians(2 * dTheta)) * rc;
  return Math.sqrt((dLp / sl) ** 2 + (dCp / sc) ** 2 + (dHp / sh) ** 2 + rt * (dCp / sc) * (dHp / sh));
}

export const colorDifference = (first: string, second: string) => deltaE2000(hexToLab(first), hexToLab(second));

/** Plain words for a CIEDE2000 difference. */
export function describeDifference(difference: number): string {
  if (difference < 2) return "Near identical";
  if (difference < 5) return "Very close";
  if (difference < 10) return "Close";
  if (difference < 20) return "Same family";
  return "Rough match";
}

export const COLOR_FAMILIES = [
  { id: "red", label: "Reds", sample: "#b8322c" },
  { id: "orange", label: "Oranges", sample: "#d9792b" },
  { id: "yellow", label: "Yellows", sample: "#e2b62f" },
  { id: "green", label: "Greens", sample: "#4f8a3c" },
  { id: "blue", label: "Blues", sample: "#3266a8" },
  { id: "purple", label: "Purples", sample: "#6d4795" },
  { id: "pink", label: "Pinks", sample: "#d4689a" },
  { id: "brown", label: "Browns", sample: "#7a5234" },
  { id: "neutral", label: "Greys & neutrals", sample: "#8a8d88" },
] as const;

export type ColorFamily = (typeof COLOR_FAMILIES)[number]["id"];

/** The broad family a painter would file a colour under. */
export function colorFamily(hex: string): ColorFamily {
  const { h, s, l } = hexToHsl(hex);
  if (l < 0.1 || l > 0.94 || s < 0.12 || (s < 0.2 && (l < 0.25 || l > 0.8))) return "neutral";
  // Dark or muted oranges and yellows are what painters call browns, ochres and leathers.
  if (h >= 12 && h < 50 && (l < 0.4 || (s < 0.45 && l < 0.6))) return "brown";
  if (h < 12 || h >= 345) return l > 0.72 ? "pink" : "red";
  if (h < 40) return "orange";
  if (h < 68) return "yellow";
  if (h < 165) return "green";
  if (h < 255) return "blue";
  if (h < 290) return "purple";
  return "pink";
}

/** Sorting key that runs round the colour wheel, with neutrals last from dark to light. */
export function hueSortKey(hex: string): number {
  const { h, l } = hexToHsl(hex);
  if (colorFamily(hex) === "neutral") return 1000 + l;
  // Start the wheel just below red so pinkish reds sit next to reds.
  return (h + 15) % 360;
}
