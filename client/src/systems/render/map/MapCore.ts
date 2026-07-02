// Shared per-frame draw primitives (route line, player arrow, HEAT arc, compass) used by both the
// minimap and the full-screen map. Everything works in SCREEN space via a caller-supplied
// `toScreen` so line widths stay crisp regardless of zoom.
import type { Vec2 } from "./mapTypes";

export type ToScreen = (worldX: number, worldZ: number) => { x: number; y: number };

export interface RouteStyle {
  color: string;
  glow: string;
  width: number;
}

/** Draw the GPS route: soft glow underlay + solid rounded line. */
export function drawRoute(
  ctx: CanvasRenderingContext2D,
  path: Vec2[],
  toScreen: ToScreen,
  style: RouteStyle,
): void {
  if (path.length < 2) return;

  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  ctx.beginPath();
  for (let i = 0; i < path.length; i++) {
    const p = path[i]!;
    const s = toScreen(p.x, p.z);
    if (i === 0) ctx.moveTo(s.x, s.y);
    else ctx.lineTo(s.x, s.y);
  }
  ctx.strokeStyle = style.glow;
  ctx.lineWidth = style.width + 6;
  ctx.stroke();

  ctx.strokeStyle = style.color;
  ctx.lineWidth = style.width;
  ctx.stroke();

  ctx.restore();
}

/** Draw the fixed player arrow. `rot` = 0 points up (screen north); rotate for north-up mode. */
export function drawPlayerArrow(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rot: number,
  size: number,
  color: string,
): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);

  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = 5;

  ctx.beginPath();
  ctx.moveTo(0, -size); // nose
  ctx.lineTo(size * 0.72, size * 0.82);
  ctx.lineTo(0, size * 0.4); // tail notch
  ctx.lineTo(-size * 0.72, size * 0.82);
  ctx.closePath();

  ctx.fillStyle = color;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "rgba(255,255,255,0.95)";
  ctx.stroke();

  ctx.restore();
}

/** Pursuit HEAT arc hugging the top of the minimap ring; grows + pulses with the tier. */
export function drawHeatArc(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  heat: number,
  maxHeat: number,
  color: string,
  time: number,
): void {
  if (heat <= 0) return;
  const frac = Math.min(1, heat / maxHeat);
  const span = frac * Math.PI * 1.2;
  const start = -Math.PI / 2 - span / 2;
  const pulse = 0.55 + 0.45 * Math.abs(Math.sin(time / 320));

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius - 1.5, start, start + span);
  ctx.strokeStyle = color;
  ctx.globalAlpha = pulse;
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.shadowColor = color;
  ctx.shadowBlur = 8;
  ctx.stroke();
  ctx.restore();
}

/** Compass "N" pip on the ring. `northAngle` is the screen angle (rad, 0 = +x) that points north. */
export function drawCompass(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  northAngle: number,
  accent: string,
): void {
  const rx = cx + Math.cos(northAngle) * (radius - 1);
  const ry = cy + Math.sin(northAngle) * (radius - 1);

  ctx.save();
  ctx.beginPath();
  ctx.arc(rx, ry, 8, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(6,8,13,0.85)";
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = accent;
  ctx.stroke();

  ctx.fillStyle = "#f4f6fb";
  ctx.font = "700 10px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("N", rx, ry + 0.5);
  ctx.restore();
}

/** Screen angle (rad) that points north given the map rotation `theta` (0 for north-up). */
export const northScreenAngle = (theta: number): number =>
  Math.atan2(-Math.cos(theta), Math.sin(theta));
