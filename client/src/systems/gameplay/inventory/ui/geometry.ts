// Wheel geometry — shared by the SVG renderer and the pointer-angle hit test so they can never
// disagree. Angles are degrees measured from the top (0) going clockwise; slot 0 is centered at
// the top.

export const SLOT_COUNT = 8;
export const SLOT_DEG = 360 / SLOT_COUNT; // 45°

/** SVG viewBox + ring radii (design space). Kept here so the renderer + hit-test agree. */
export const WHEEL_VIEWBOX = 520;
export const WHEEL_R_INNER = 96;
export const WHEEL_R_OUTER = 240;

/** Rendered pixel diameter of the wheel (mirrors the `.wheelWrap` CSS clamp). */
export function wheelPixelSize(): number {
  if (typeof window === "undefined") return 520;
  const vmin = Math.min(window.innerWidth, window.innerHeight);
  return Math.min(0.78 * vmin, 560);
}

const r2 = (n: number): number => Math.round(n * 100) / 100;

/** Point on a circle at `deg` (0 = up, clockwise). */
export function pointOnCircle(
  cx: number,
  cy: number,
  r: number,
  deg: number,
): readonly [number, number] {
  const a = (deg * Math.PI) / 180;
  return [r2(cx + r * Math.sin(a)), r2(cy - r * Math.cos(a))] as const;
}

/** SVG path `d` for a donut wedge centered on `slot`, with an angular gap between segments. */
export function wedgePath(
  cx: number,
  cy: number,
  rInner: number,
  rOuter: number,
  slot: number,
  gapDeg = 1.6,
): string {
  const half = SLOT_DEG / 2 - gapDeg;
  const a0 = slot * SLOT_DEG - half;
  const a1 = slot * SLOT_DEG + half;
  const [ix0, iy0] = pointOnCircle(cx, cy, rInner, a0);
  const [ox0, oy0] = pointOnCircle(cx, cy, rOuter, a0);
  const [ox1, oy1] = pointOnCircle(cx, cy, rOuter, a1);
  const [ix1, iy1] = pointOnCircle(cx, cy, rInner, a1);
  return (
    `M ${ix0} ${iy0} L ${ox0} ${oy0} ` +
    `A ${rOuter} ${rOuter} 0 0 1 ${ox1} ${oy1} ` +
    `L ${ix1} ${iy1} ` +
    `A ${rInner} ${rInner} 0 0 0 ${ix0} ${iy0} Z`
  );
}

/** Screen-space delta from the wheel center -> hovered slot, or -1 inside the dead-zone. */
export function angleToSlot(dx: number, dy: number, dist: number, deadzone: number): number {
  if (dist < deadzone) return -1;
  const deg = ((Math.atan2(dy, dx) * 180) / Math.PI + 90 + 360 + SLOT_DEG / 2) % 360;
  return Math.floor(deg / SLOT_DEG) % SLOT_COUNT;
}
