// Blip icon drawing, palette resolution and minimap edge-clamp math.
// Shapes are style-distinct so the map stays readable in the colour-blind palette too.
import { BLIP_COLORS, BLIP_COLORS_CB } from "./mapConstants";
import type { Blip, BlipStyle } from "./mapTypes";

export function resolveBlipColor(style: BlipStyle, colorBlind: boolean, override?: string): string {
  if (override) return override;
  return (colorBlind ? BLIP_COLORS_CB : BLIP_COLORS)[style];
}

export interface RingClamp {
  x: number;
  y: number;
  clamped: boolean;
  angle: number;
}

/** Clamp an offset (dx,dy from centre) to a ring of `radius`, leaving `margin` px inside. */
export function clampToRing(dx: number, dy: number, radius: number, margin: number): RingClamp {
  const d = Math.hypot(dx, dy);
  const limit = radius - margin;
  const angle = Math.atan2(dy, dx);
  if (d <= limit || d < 1e-3) return { x: dx, y: dy, clamped: false, angle };
  const s = limit / d;
  return { x: dx * s, y: dy * s, clamped: true, angle };
}

export interface BlipDrawOpts {
  size: number;
  colorBlind: boolean;
  clamped?: boolean;
  angle?: number; // outward angle when clamped
  playerY?: number; // for height caret
  time?: number; // ms, for sonar pulse
  selected?: boolean;
}

const HALO = "rgba(3,4,8,0.85)";

/** Draw one blip at screen (x,y). Handles clamp chevrons, height carets and the objective pulse. */
export function drawBlipIcon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  blip: Blip,
  opts: BlipDrawOpts,
): void {
  const color = resolveBlipColor(blip.style, opts.colorBlind, blip.color);
  const s = opts.size;

  ctx.save();
  ctx.translate(x, y);

  if (opts.clamped) {
    drawChevron(ctx, opts.angle ?? 0, s, color);
    ctx.restore();
    return;
  }

  if (blip.sonar) drawSonar(ctx, s, color, opts.time ?? 0);

  switch (blip.style) {
    case "waypoint":
      drawWaypointPin(ctx, s, color);
      break;
    case "mission":
    case "objective":
      drawDiamond(ctx, s, color);
      break;
    case "enemy":
      drawTriangle(ctx, s, color);
      break;
    case "police":
      drawSquare(ctx, s, color);
      break;
    case "friend":
      drawRingDot(ctx, s, color);
      break;
    case "vehicle":
      drawRoundedChip(ctx, s, color);
      break;
    case "poi":
    case "pickup":
      drawDot(ctx, s * 0.82, color);
      break;
    case "player":
    default:
      drawDot(ctx, s, color);
      break;
  }

  if (opts.selected) {
    ctx.beginPath();
    ctx.arc(0, 0, s + 4, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  if (blip.height !== undefined && opts.playerY !== undefined) {
    const dy = blip.height - opts.playerY;
    if (dy > 3) drawCaret(ctx, s, color, true);
    else if (dy < -3) drawCaret(ctx, s, color, false);
  }

  ctx.restore();
}

function halo(ctx: CanvasRenderingContext2D, w = 2): void {
  ctx.lineWidth = w;
  ctx.strokeStyle = HALO;
  ctx.stroke();
}

function drawDot(ctx: CanvasRenderingContext2D, s: number, color: string): void {
  ctx.beginPath();
  ctx.arc(0, 0, s, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  halo(ctx);
}

function drawRingDot(ctx: CanvasRenderingContext2D, s: number, color: string): void {
  ctx.beginPath();
  ctx.arc(0, 0, s, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, s + 2, 0, Math.PI * 2);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "rgba(255,255,255,0.7)";
  ctx.stroke();
}

function drawSquare(ctx: CanvasRenderingContext2D, s: number, color: string): void {
  const r = s * 0.92;
  ctx.beginPath();
  ctx.rect(-r, -r, r * 2, r * 2);
  ctx.fillStyle = color;
  ctx.fill();
  halo(ctx);
}

function drawRoundedChip(ctx: CanvasRenderingContext2D, s: number, color: string): void {
  const w = s * 1.1;
  const h = s * 0.78;
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
  const r = s * 1.25;
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
  const r = s * 1.2;
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

function drawWaypointPin(ctx: CanvasRenderingContext2D, s: number, color: string): void {
  const r = s * 1.05;
  ctx.beginPath();
  ctx.arc(0, -r, r, Math.PI * 0.15, Math.PI * 0.85, true);
  ctx.lineTo(0, r * 1.35);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  halo(ctx);
  ctx.beginPath();
  ctx.arc(0, -r, r * 0.4, 0, Math.PI * 2);
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
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.strokeStyle = color;
  ctx.globalAlpha = 1 - t;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.globalAlpha = 1;
}
