// Phone Maps app — mirrors the same blip data the HUD radar uses (v0 hud.store.blips), rendered
// player-centered. Read-only view; no per-frame React (re-renders only when blips change).
import { useHudStore } from "@/stores/hud.store";
import type { Blip, BlipKind } from "@sunbreak/shared";
import s from "../phone.module.css";

const VIEW = 264;
const RANGE = 240; // world meters across the view
const SCALE = VIEW / RANGE;

// Literal colors (mirror tokens) — SVG presentation attributes don't resolve CSS var().
const KIND_COLOR: Record<BlipKind, string> = {
  player: "#ffd166",
  mission: "#ff8a4c",
  vehicle: "#63b3ff",
  enemy: "#ff2d6f",
  shop: "#6fe0a8",
  waypoint: "#ff5d8f",
};

export function Maps() {
  const blips = useHudStore((st) => st.blips);
  const player = blips.find((b) => b.kind === "player");
  const cx0 = player?.x ?? 0;
  const cz0 = player?.z ?? 0;

  const project = (b: Blip) => {
    const px = VIEW / 2 + (b.x - cx0) * SCALE;
    const py = VIEW / 2 + (b.z - cz0) * SCALE;
    return {
      x: Math.max(6, Math.min(VIEW - 6, px)),
      y: Math.max(6, Math.min(VIEW - 6, py)),
      clamped: px < 6 || px > VIEW - 6 || py < 6 || py > VIEW - 6,
    };
  };

  return (
    <div className={s.maps}>
      <svg viewBox={`0 0 ${VIEW} ${VIEW}`} className={s.mapSvg} role="img" aria-label="City map">
        <defs>
          <radialGradient id="ux-map-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(255,138,76,0.10)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0)" />
          </radialGradient>
        </defs>
        <rect x="0" y="0" width={VIEW} height={VIEW} fill="#0b0d13" />
        <rect x="0" y="0" width={VIEW} height={VIEW} fill="url(#ux-map-glow)" />
        {Array.from({ length: 9 }, (_, i) => (
          <g key={i} stroke="rgba(255,255,255,0.1)" strokeWidth="1">
            <line x1={(VIEW / 8) * i} y1="0" x2={(VIEW / 8) * i} y2={VIEW} />
            <line x1="0" y1={(VIEW / 8) * i} x2={VIEW} y2={(VIEW / 8) * i} />
          </g>
        ))}
        {blips
          .filter((b) => b.kind !== "player")
          .map((b) => {
            const p = project(b);
            return (
              <circle
                key={b.id}
                cx={p.x}
                cy={p.y}
                r={b.kind === "mission" ? 5 : 4}
                fill={KIND_COLOR[b.kind]}
                opacity={p.clamped ? 0.5 : 1}
              />
            );
          })}
        {/* Player marker at center */}
        <g transform={`translate(${VIEW / 2}, ${VIEW / 2})`}>
          <circle r="9" fill="none" stroke="#ffd166" strokeWidth="1.5" opacity="0.5" />
          <path d="M0 -6 L5 6 L0 3 L-5 6 Z" fill="#ffd166" />
        </g>
      </svg>

      <div className={s.mapLegend}>
        {(["mission", "shop", "enemy", "waypoint"] as BlipKind[]).map((k) => (
          <span key={k} className={s.mapLegendItem}>
            <span className={s.mapDot} style={{ background: KIND_COLOR[k] }} />
            {k}
          </span>
        ))}
      </div>
    </div>
  );
}
