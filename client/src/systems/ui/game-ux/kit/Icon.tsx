// Hand-rolled inline SVG icon set (stroke-based, `currentColor`). Avoids a `lucide-react`
// dependency (not pre-installed) while keeping the same ergonomic <Icon name=... /> API.
import type { CSSProperties } from "react";

export type IconName =
  | "close"
  | "back"
  | "forward"
  | "phone"
  | "message"
  | "map"
  | "wallet"
  | "bag"
  | "cash"
  | "heart"
  | "shield"
  | "star"
  | "check"
  | "alert"
  | "info"
  | "pickup"
  | "flatline"
  | "cuffs"
  | "signal"
  | "battery"
  | "search"
  | "send"
  | "target"
  | "pin"
  | "dot";

const PATHS: Record<IconName, string> = {
  close: "M6 6l12 12M18 6L6 18",
  back: "M15 6l-6 6 6 6",
  forward: "M9 6l6 6-6 6",
  phone: "M7 4h10v16H7zM10 18h4",
  message: "M4 5h16v11H9l-4 3v-3H4z",
  map: "M9 4L4 6v14l5-2 6 2 5-2V4l-5 2-6-2zM9 4v14M15 6v14",
  wallet: "M4 7h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4zM4 7V6a1 1 0 0 1 1-1h11M16 13h2",
  bag: "M6 8h12l-1 12H7zM9 8V6a3 3 0 0 1 6 0v2",
  cash: "M3 7h18v10H3zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6M6 7v10M18 7v10",
  heart: "M12 20s-7-4.5-7-9a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 4.5-7 9-7 9z",
  shield: "M12 3l7 3v5c0 4-3 7-7 9-4-2-7-5-7-9V6z",
  star: "M12 4l2.4 4.9 5.4.8-3.9 3.8.9 5.3L12 16.9 7.2 19l.9-5.3L4.2 9.7l5.4-.8z",
  check: "M5 12l4.5 4.5L19 7",
  alert: "M12 4l9 16H3zM12 10v4M12 17.5v.5",
  info: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 11v5M12 8v.5",
  pickup: "M4 8l8-4 8 4-8 4-8-4zM4 8v8l8 4 8-4V8M12 12v8",
  flatline: "M2 12h5l2-5 3 10 2-6 2 1h6",
  cuffs: "M8 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6M16 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6M11 12h2",
  signal: "M4 18v-3M9 18v-6M14 18v-9M19 18V6",
  battery: "M3 8h15v8H3zM18 11h2v2h-2",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14M20 20l-4-4",
  send: "M4 12l16-8-6 16-3-6-7-2z",
  target: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 11.5a.5.5 0 1 0 0 1 .5.5 0 0 0 0-1",
  pin: "M12 21s7-6 7-11a7 7 0 0 0-14 0c0 5 7 11 7 11zM12 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4",
  dot: "M12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4",
};

export interface IconProps {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
  style?: CSSProperties;
  title?: string;
}

export function Icon({ name, size = 20, strokeWidth = 1.75, className, style, title }: IconProps) {
  const d = PATHS[name] ?? PATHS.dot;
  return (
    <svg
      className={className}
      style={style}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      focusable={false}
    >
      {title ? <title>{title}</title> : null}
      <path d={d} />
    </svg>
  );
}
