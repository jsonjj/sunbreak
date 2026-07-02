// Optional self-contained DOM overlay: 1–5 stars that blink white→gray while `searching`.
// This is a convenience — the canonical HUD path is the shared central HUD store's `heat` field
// (written by hudMirrorSystem), which the ui/menu-hud subsystem renders. Mount this only if you
// want a drop-in stars widget without waiting on the HUD subsystem. Reads the rich wanted store.
import { useEffect } from "react";
import { useWantedStore } from "../store";
import { MAX_STARS } from "../tuning";

const STYLE_ID = "wanted-stars-keyframes";

function ensureStyles(): void {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent =
    "@keyframes wantedStarBlink{0%,100%{opacity:1}50%{opacity:.25}}" +
    ".wanted-stars{position:absolute;top:16px;right:18px;display:flex;gap:4px;" +
    "font-size:26px;line-height:1;text-shadow:0 2px 6px rgba(0,0,0,.55);pointer-events:none;" +
    "font-family:ui-sans-serif,system-ui,sans-serif}" +
    ".wanted-stars__s{color:#ffd23f}" +
    ".wanted-stars__s--off{color:rgba(255,255,255,.16)}" +
    ".wanted-stars--searching .wanted-stars__s{animation:wantedStarBlink 1s ease-in-out infinite}";
  document.head.appendChild(el);
}

export function WantedStars() {
  const stars = useWantedStore((s) => s.stars);
  const searching = useWantedStore((s) => s.searching);

  useEffect(() => {
    ensureStyles();
  }, []);

  if (stars <= 0 && !searching) return null;

  return (
    <div
      className={`wanted-stars${searching ? " wanted-stars--searching" : ""}`}
      role="status"
      aria-label={`Wanted level ${stars} of ${MAX_STARS}`}
    >
      {Array.from({ length: MAX_STARS }, (_, i) => (
        <span
          key={i}
          aria-hidden
          className={`wanted-stars__s${i < stars ? "" : " wanted-stars__s--off"}`}
        >
          ★
        </span>
      ))}
    </div>
  );
}
