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

// ── Dynamic layout (N owned segments) ─────────────────────────────────────────────────────────
// The wheel now renders one wedge PER OWNED WEAPON, so the segment count is dynamic (1..8).
// These helpers mirror the fixed-slot ones above but take an explicit `count`, and the renderer
// + hit-test both call them so the geometry can never disagree.

/** Angular width of one segment for a wheel of `count` slices. */
export function segmentArc(count: number): number {
  return count > 0 ? 360 / count : 360;
}

/** Center angle (deg, 0 = up, clockwise) of segment `index` in a `count`-slice wheel. */
export function segmentCenterDeg(index: number, count: number): number {
  return count <= 1 ? 0 : index * segmentArc(count);
}

/** SVG path `d` for a full donut ring (used when the player owns a single weapon). */
export function ringPath(cx: number, cy: number, rInner: number, rOuter: number): string {
  return (
    `M ${r2(cx - rOuter)} ${r2(cy)} ` +
    `A ${rOuter} ${rOuter} 0 1 0 ${r2(cx + rOuter)} ${r2(cy)} ` +
    `A ${rOuter} ${rOuter} 0 1 0 ${r2(cx - rOuter)} ${r2(cy)} Z ` +
    `M ${r2(cx - rInner)} ${r2(cy)} ` +
    `A ${rInner} ${rInner} 0 1 1 ${r2(cx + rInner)} ${r2(cy)} ` +
    `A ${rInner} ${rInner} 0 1 1 ${r2(cx - rInner)} ${r2(cy)} Z`
  );
}

/** SVG path `d` for a donut wedge — segment `index` of `count`, with an angular gap between. */
export function wedgePathN(
  cx: number,
  cy: number,
  rInner: number,
  rOuter: number,
  index: number,
  count: number,
  gapDeg = 1.6,
): string {
  if (count <= 1) return ringPath(cx, cy, rInner, rOuter);
  const arc = segmentArc(count);
  const half = arc / 2 - gapDeg;
  const a0 = index * arc - half;
  const a1 = index * arc + half;
  const large = a1 - a0 > 180 ? 1 : 0;
  const [ix0, iy0] = pointOnCircle(cx, cy, rInner, a0);
  const [ox0, oy0] = pointOnCircle(cx, cy, rOuter, a0);
  const [ox1, oy1] = pointOnCircle(cx, cy, rOuter, a1);
  const [ix1, iy1] = pointOnCircle(cx, cy, rInner, a1);
  return (
    `M ${ix0} ${iy0} L ${ox0} ${oy0} ` +
    `A ${rOuter} ${rOuter} 0 ${large} 1 ${ox1} ${oy1} ` +
    `L ${ix1} ${iy1} ` +
    `A ${rInner} ${rInner} 0 ${large} 0 ${ix0} ${iy0} Z`
  );
}

/** Screen-space delta -> hovered segment index (0..count-1), or -1 inside the dead-zone. */
export function angleToIndexN(
  dx: number,
  dy: number,
  dist: number,
  deadzone: number,
  count: number,
): number {
  if (count <= 0 || dist < deadzone) return -1;
  if (count === 1) return 0;
  const arc = segmentArc(count);
  const deg = ((Math.atan2(dy, dx) * 180) / Math.PI + 90 + 360 + arc / 2) % 360;
  return Math.floor(deg / arc) % count;
}

/** Client (viewport) point -> hovered segment index using the live wheel size. -1 = dead-zone. */
export function pointerToIndex(clientX: number, clientY: number, count: number): number {
  const size = wheelPixelSize();
  const dx = clientX - window.innerWidth / 2;
  const dy = clientY - window.innerHeight / 2;
  const dist = Math.hypot(dx, dy);
  const deadzone = size * (WHEEL_R_INNER / WHEEL_VIEWBOX);
  return angleToIndexN(dx, dy, dist, deadzone, count);
}

/** Distance in px from the wheel center to the given client point (for click bounds). */
export function pointerRadius(clientX: number, clientY: number): number {
  const dx = clientX - window.innerWidth / 2;
  const dy = clientY - window.innerHeight / 2;
  return Math.hypot(dx, dy);
}

/** Outer selectable radius (px) — slightly past the ring so ring-edge clicks still register. */
export function wheelOuterRadiusPx(): number {
  return wheelPixelSize() * (WHEEL_R_OUTER / WHEEL_VIEWBOX) + 10;
}
