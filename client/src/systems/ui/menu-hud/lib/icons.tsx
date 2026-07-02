import type { ReactNode } from "react";

export interface IconProps {
  size?: number;
  className?: string;
  strokeWidth?: number;
}

function Svg({
  size = 20,
  className,
  strokeWidth = 1.8,
  children,
}: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

/* ── HUD glyphs ──────────────────────────────────────────────────────────── */
export const IconHeart = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 20s-7-4.6-9.2-9C1.4 8.1 2.7 5 5.7 5 7.7 5 9 6.2 12 9c3-2.8 4.3-4 6.3-4 3 0 4.3 3.1 2.9 6-2.2 4.4-9.2 9-9.2 9Z" />
  </Svg>
);
export const IconShield = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3 5 6v5c0 4.3 2.9 8 7 10 4.1-2 7-5.7 7-10V6l-7-3Z" />
  </Svg>
);
export const IconBolt = (p: IconProps) => (
  <Svg {...p}>
    <path d="M13 3 5 13h5l-1 8 8-11h-5l1-7Z" />
  </Svg>
);
export const IconSpark = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" />
  </Svg>
);
export const IconStar = (p: IconProps) => (
  <svg
    width={p.size ?? 20}
    height={p.size ?? 20}
    viewBox="0 0 24 24"
    fill="currentColor"
    className={p.className}
    aria-hidden="true"
    focusable="false"
  >
    <path d="M12 2.6l2.7 5.9 6.4.7-4.8 4.3 1.3 6.3L12 17.9 6.4 20.1l1.3-6.3L3 9.5l6.4-.7L12 2.6Z" />
  </svg>
);
export const IconCash = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2.5" y="6" width="19" height="12" rx="2.4" />
    <circle cx="12" cy="12" r="2.6" />
    <path d="M6 9.5v5M18 9.5v5" />
  </Svg>
);

/* ── Weapons ─────────────────────────────────────────────────────────────── */
export const IconFist = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 11V8.5a1.5 1.5 0 0 1 3 0V11m0 0V7.5a1.5 1.5 0 0 1 3 0V11m0 0V8a1.5 1.5 0 0 1 3 0v3m0 0v-1a1.5 1.5 0 0 1 3 0v4a5 5 0 0 1-5 5h-2.6a5 5 0 0 1-3.8-1.7L4 15.2a1.6 1.6 0 0 1 2.3-2.2L8 14" />
  </Svg>
);
export const IconPistol = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 8h13a1 1 0 0 1 1 1v2h2M4 8v4a1 1 0 0 0 1 1h2l-1.5 5M7 13h6" />
  </Svg>
);
export const IconSmg = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 8h15v3H21M3 8v3h3v4M9 11v3M13 11l-2 6" />
  </Svg>
);
export const IconRifle = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2 9h18l2-1v3l-2 1h-3M2 9v2h4l-1 5M9 11v2" />
  </Svg>
);
export const IconShotgun = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2 9h20M2 12h9l-1.5 5M13 12h4l1 4M6 9v3" />
  </Svg>
);

export function weaponIcon(id: string | null): (p: IconProps) => ReactNode {
  switch (id) {
    case "pistol":
      return IconPistol;
    case "smg":
      return IconSmg;
    case "rifle":
      return IconRifle;
    case "shotgun":
      return IconShotgun;
    case "fists":
      return IconFist;
    default:
      return IconFist;
  }
}

/* ── UI / navigation ─────────────────────────────────────────────────────── */
export const IconPlay = (p: IconProps) => (
  <svg
    width={p.size ?? 20}
    height={p.size ?? 20}
    viewBox="0 0 24 24"
    fill="currentColor"
    className={p.className}
    aria-hidden="true"
    focusable="false"
  >
    <path d="M8 5.2v13.6c0 .8.9 1.3 1.6.9l10.4-6.8a1 1 0 0 0 0-1.7L9.6 4.3A1 1 0 0 0 8 5.2Z" />
  </svg>
);
export const IconSettings = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 7h9M17 7h2M5 12h2M10 12h9M5 17h12M18 17h1" />
    <circle cx="15" cy="7" r="2" />
    <circle cx="8" cy="12" r="2" />
    <circle cx="15" cy="17" r="2" />
  </Svg>
);
export const IconMonitor = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="4" width="18" height="12" rx="2" />
    <path d="M9 20h6M12 16v4" />
  </Svg>
);
export const IconAudio = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 9v6h3l5 4V5L7 9H4Z" />
    <path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" />
  </Svg>
);
export const IconGamepad = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2.5" y="7" width="19" height="10" rx="4" />
    <path d="M7 10v4M5 12h4M15.5 11h.01M18 13.5h.01" />
  </Svg>
);
export const IconAccessibility = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="5" r="1.6" />
    <path d="M5 8h14M12 8v6M8.5 20 12 14l3.5 6" />
  </Svg>
);
export const IconMap = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 4 4 6v14l5-2 6 2 5-2V4l-5 2-6-2Z" />
    <path d="M9 4v14M15 6v14" />
  </Svg>
);
export const IconFlag = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 21V4M6 5h11l-2 3 2 3H6" />
  </Svg>
);
export const IconChart = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 20h16M7 20v-6M12 20V8M17 20v-9" />
  </Svg>
);
export const IconSave = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 4h11l3 3v13H5V4Z" />
    <path d="M8 4v5h7M8 20v-5h8v5" />
  </Svg>
);
export const IconExit = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14 4H6v16h8M10 12h10M17 8l4 4-4 4" />
  </Svg>
);
export const IconChevronRight = (p: IconProps) => (
  <Svg {...p}>
    <path d="m9 6 6 6-6 6" />
  </Svg>
);
export const IconChevronDown = (p: IconProps) => (
  <Svg {...p}>
    <path d="m6 9 6 6 6-6" />
  </Svg>
);
export const IconCheck = (p: IconProps) => (
  <Svg {...p}>
    <path d="m5 12.5 4.5 4.5L19 6" />
  </Svg>
);
export const IconClose = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Svg>
);
export const IconReset = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 4v5h5M4.6 15a8 8 0 1 0 1.3-8.3L4 9" />
  </Svg>
);
