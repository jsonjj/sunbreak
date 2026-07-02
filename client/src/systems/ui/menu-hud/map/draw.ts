// Per-frame canvas draw primitives shared by the minimap + full map. Everything works in SCREEN
// space via a caller-supplied `toScreen` so line widths stay crisp regardless of zoom. Blip icons
// are SHAPE-distinct (not just colour) so the map reads in the colour-blind palette too.
import { BLIP_STYLE, blipColor } from "./palette";
import type { BlipShape } from "./palette";
import type { MapBlip, Vec2 } from "./types";

const HALO = "rgba(4,5,10,0.85)";
const TAU = Math.PI * 2;

export type ToScreen = (worldX: number, worldZ: number) => { x: number; y: number };

export interface RouteStyle {
  color: string;
  glow: string;
  width: number;
  dashPhase?: number;
}

/** GPS route: soft glow underlay + solid rounded line + marching dashes for a "live" feel. */
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

  const trace = () => {
    ctx.beginPath();
    for (let i = 0; i < path.length; i++) {
      const s = toScreen(path[i]!.x, path[i]!.z);
      if (i === 0) ctx.moveTo(s.x, s.y);
      else ctx.lineTo(s.x, s.y);
    }
  };

  trace();
  ctx.strokeStyle = style.glow;
  ctx.lineWidth = style.width + 6;
  ctx.stroke();

  trace();
  ctx.strokeStyle = style.color;
  ctx.lineWidth = style.width;
  ctx.stroke();

  // marching highlight dashes
  trace();
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.lineWidth = Math.max(1, style.width - 2.5);
  ctx.setLineDash([2, 12]);
  ctx.lineDashOffset = -(style.dashPhase ?? 0);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

/** Fixed player arrow. `rot` = 0 points up (screen north); rotate for north-up mode. */
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
  ctx.moveTo(0, -size);
  ctx.lineTo(size * 0.72, size * 0.82);
  ctx.lineTo(0, size * 0.38);
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
  const span = frac * Math.PI * 1.25;
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

/** Compass "N" pip on the ring. `northAngle` = the screen angle (rad, 0 = +x) pointing north. */
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
  ctx.arc(rx, ry, 8.5, 0, TAU);
  ctx.fillStyle = "rgba(6,8,13,0.9)";
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = accent;
  ctx.stroke();
  ctx.fillStyle = "#f4f6fb";
  ctx.font = "800 10px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("N", rx, ry + 0.5);
  ctx.restore();
}

export interface BlipDrawOpts {
  size: number;
  colorBlind: boolean;
  clamped?: boolean;
  angle?: number; // outward angle when clamped
  playerY?: number; // for the height caret
  time?: number; // ms, for the sonar pulse
  selected?: boolean;
  glyph?: boolean; // draw the kind glyph (full map only)
  label?: boolean; // draw the text label (full map only)
}

/** Draw one blip at screen (x,y). Handles clamp chevrons, height carets, sonar, glyph + label. */
export function drawBlip(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  blip: MapBlip,
  opts: BlipDrawOpts,
): void {
  const color = blipColor(blip.kind, opts.colorBlind, blip.color);
  const style = BLIP_STYLE[blip.kind];
  const s = opts.size;

  ctx.save();
  ctx.translate(x, y);

  if (opts.clamped) {
    drawChevron(ctx, opts.angle ?? 0, s, color);
    ctx.restore();
    return;
  }

  if (blip.sonar) drawSonar(ctx, s, color, opts.time ?? 0);
  drawShape(ctx, style.shape, s, color);

  if (opts.glyph && style.glyph) {
    ctx.fillStyle = "rgba(6,8,13,0.95)";
    ctx.font = `800 ${Math.round(s * 1.05)}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(style.glyph, 0, 0.5);
  }

  if (opts.selected) {
    ctx.beginPath();
    ctx.arc(0, 0, s + 5, 0, TAU);
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }

  if (blip.y !== undefined && opts.playerY !== undefined) {
    const dy = blip.y - opts.playerY;
    if (dy > 3) drawCaret(ctx, s, color, true);
    else if (dy < -3) drawCaret(ctx, s, color, false);
  }

  ctx.restore();

  if (opts.label && blip.label) {
    ctx.save();
    ctx.font = "600 11px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.strokeText(blip.label, x + s + 6, y + 0.5);
    ctx.fillStyle = "rgba(240,243,250,0.92)";
    ctx.fillText(blip.label, x + s + 6, y + 0.5);
    ctx.restore();
  }
}

function drawShape(ctx: CanvasRenderingContext2D, shape: BlipShape, s: number, color: string): void {
  switch (shape) {
    case "pin":
      return drawPin(ctx, s, color);
    case "circle":
      return drawDisc(ctx, s, color, true);
    case "ring":
      return drawRing(ctx, s, color);
    case "diamond":
      return drawDiamond(ctx, s, color);
    case "square":
      return drawSquare(ctx, s, color);
    case "triangle":
      return drawTriangle(ctx, s, color);
    case "chip":
      return drawChip(ctx, s, color);
    case "star":
      return drawStar(ctx, s, color);
    case "cross":
      return drawCross(ctx, s, color);
    case "house":
      return drawHouse(ctx, s, color);
    case "dot":
    default:
      return drawDisc(ctx, s * 0.82, color, false);
  }
}

function halo(ctx: CanvasRenderingContext2D, w = 2): void {
  ctx.lineWidth = w;
  ctx.strokeStyle = HALO;
  ctx.stroke();
}

function drawDisc(ctx: CanvasRenderingContext2D, s: number, color: string, bright: boolean): void {
  ctx.beginPath();
  ctx.arc(0, 0, s, 0, TAU);
  ctx.fillStyle = color;
  ctx.fill();
  halo(ctx);
  if (bright) {
    ctx.beginPath();
    ctx.arc(0, 0, s + 2, 0, TAU);
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }
}

function drawRing(ctx: CanvasRenderingContext2D, s: number, color: string): void {
  ctx.beginPath();
  ctx.arc(0, 0, s, 0, TAU);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, s + 2.2, 0, TAU);
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = "rgba(255,255,255,0.75)";
  ctx.stroke();
}

function drawSquare(ctx: CanvasRenderingContext2D, s: number, color: string): void {
  const r = s * 0.94;
  ctx.beginPath();
  ctx.rect(-r, -r, r * 2, r * 2);
  ctx.fillStyle = color;
  ctx.fill();
  halo(ctx);
}

function drawChip(ctx: CanvasRenderingContext2D, s: number, color: string): void {
  const w = s * 1.15;
  const h = s * 0.82;
  const r = h * 0.5;
  ctx.beginPath();
  ctx.moveTo(-w + r, -h);
  ctx.arcTo(w, -h, w, h, r);
  ctx.arcTo(w, h, -w, h, r);
  ctx.arcTo(-w, h, -w, -h, r);
  ctx.arcTo(-w, -h, w, -h, r);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  halo(ctx);
}

function drawTriangle(ctx: CanvasRenderingContext2D, s: number, color: string): void {
  const r = s * 1.28;
  ctx.beginPath();
  ctx.moveTo(0, r);
  ctx.lineTo(r * 0.9, -r * 0.75);
  ctx.lineTo(-r * 0.9, -r * 0.75);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  halo(ctx);
}

function drawDiamond(ctx: CanvasRenderingContext2D, s: number, color: string): void {
  const r = s * 1.22;
  ctx.beginPath();
  ctx.moveTo(0, -r);
  ctx.lineTo(r, 0);
  ctx.lineTo(0, r);
  ctx.lineTo(-r, 0);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  halo(ctx);
}

function drawStar(ctx: CanvasRenderingContext2D, s: number, color: string): void {
  const spikes = 5;
  const outer = s * 1.35;
  const inner = s * 0.6;
  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (i / (spikes * 2)) * TAU - Math.PI / 2;
    const px = Math.cos(a) * r;
    const py = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  halo(ctx, 1.5);
}

function drawCross(ctx: CanvasRenderingContext2D, s: number, color: string): void {
  const a = s * 0.42;
  const b = s * 1.15;
  ctx.beginPath();
  ctx.rect(-a, -b, a * 2, b * 2);
  ctx.rect(-b, -a, b * 2, a * 2);
  ctx.fillStyle = color;
  ctx.fill();
  halo(ctx, 1.5);
}

function drawHouse(ctx: CanvasRenderingContext2D, s: number, color: string): void {
  const w = s * 1.1;
  ctx.beginPath();
  ctx.moveTo(0, -w * 1.2);
  ctx.lineTo(w, -w * 0.1);
  ctx.lineTo(w * 0.62, -w * 0.1);
  ctx.lineTo(w * 0.62, w);
  ctx.lineTo(-w * 0.62, w);
  ctx.lineTo(-w * 0.62, -w * 0.1);
  ctx.lineTo(-w, -w * 0.1);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  halo(ctx);
}

function drawPin(ctx: CanvasRenderingContext2D, s: number, color: string): void {
  const r = s * 1.05;
  ctx.beginPath();
  ctx.arc(0, -r, r, Math.PI * 0.15, Math.PI * 0.85, true);
  ctx.lineTo(0, r * 1.4);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  halo(ctx);
  ctx.beginPath();
  ctx.arc(0, -r, r * 0.42, 0, TAU);
  ctx.fillStyle = HALO;
  ctx.fill();
}

function drawChevron(ctx: CanvasRenderingContext2D, angle: number, s: number, color: string): void {
  ctx.save();
  ctx.rotate(angle);
  const r = s * 1.35;
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(-r * 0.35, r * 0.8);
  ctx.lineTo(-r * 0.35, -r * 0.8);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  halo(ctx, 1.5);
  ctx.restore();
}

function drawCaret(ctx: CanvasRenderingContext2D, s: number, color: string, up: boolean): void {
  const dir = up ? -1 : 1;
  const x = s + 4;
  ctx.beginPath();
  ctx.moveTo(x, dir * -s * 0.5);
  ctx.lineTo(x + s * 0.7, dir * s * 0.4);
  ctx.lineTo(x - s * 0.7, dir * s * 0.4);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  halo(ctx, 1);
}

function drawSonar(ctx: CanvasRenderingContext2D, s: number, color: string, time: number): void {
  const t = (time % 1400) / 1400;
  const r = s + t * s * 3.5;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.strokeStyle = color;
  ctx.globalAlpha = 1 - t;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.globalAlpha = 1;
}
