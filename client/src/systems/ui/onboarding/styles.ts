// Scoped stylesheet, injected once at runtime. We can't edit v0's index.css (out of folder),
// so onboarding ships its own `onb-` prefixed styles here. They reuse the SUNBREAK design
// tokens already declared on :root (--glass, --hairline, --accent, --shadow, …) for a premium,
// glassy, high-contrast overlay that reads over any scene. Honors prefers-reduced-motion and
// an opt-in [data-reduced] flag driven by the in-game accessibility settings.
const STYLE_ID = "onb-styles";

const CSS = `
.onb-root{
  position:fixed; inset:0; z-index:20; pointer-events:none;
  font-family:inherit; color:var(--ink);
  font-variant-numeric:tabular-nums;
  --onb-scale:1;
}
.onb-root *{ box-sizing:border-box; }

/* ---------- shared surface + chips ---------- */
.onb-panel{
  background:var(--glass);
  border:1px solid var(--hairline);
  border-radius:var(--radius);
  box-shadow:var(--shadow);
  backdrop-filter:blur(12px); -webkit-backdrop-filter:blur(12px);
}
.onb-kicker{
  font-size:calc(10px * var(--onb-scale)); font-weight:700;
  letter-spacing:.28em; text-transform:uppercase; color:var(--accent);
}
.onb-chip{
  display:inline-flex; align-items:center; justify-content:center;
  min-width:26px; height:26px; padding:0 8px;
  font-size:calc(12px * var(--onb-scale)); font-weight:700; line-height:1; color:var(--ink);
  background:rgba(255,255,255,.10); border:1px solid var(--hairline);
  border-bottom-width:2px; border-radius:7px;
}
.onb-chip[data-done="true"]{
  color:#0b0d12;
  background:linear-gradient(92deg,var(--accent-2),var(--accent));
  border-color:transparent;
}

/* ---------- first-run card (bottom-center) ---------- */
.onb-card{
  position:absolute; left:50%; bottom:104px; transform:translateX(-50%);
  width:min(460px,92vw); padding:18px 20px 16px; pointer-events:auto;
  animation:onb-rise .22s ease both;
}
.onb-card__head{ display:flex; align-items:baseline; justify-content:space-between; gap:12px; }
.onb-card__title{ margin:6px 0 2px; font-size:calc(19px * var(--onb-scale)); font-weight:800; letter-spacing:-.01em; }
.onb-card__sub{ margin:0; color:var(--muted); font-size:calc(13px * var(--onb-scale)); line-height:1.45; }
.onb-card__glyphs{ display:flex; flex-wrap:wrap; gap:8px; margin:14px 0 4px; }
.onb-glyph{ display:flex; flex-direction:column; align-items:center; gap:6px; }
.onb-glyph__check{ font-size:11px; color:var(--muted); height:12px; line-height:1; }
.onb-glyph__check[data-done="true"]{ color:var(--accent-2); }
.onb-card__foot{ display:flex; align-items:center; justify-content:space-between; margin-top:12px; gap:10px; }
.onb-progress{ display:flex; gap:5px; }
.onb-progress__dot{ width:7px; height:7px; border-radius:50%; background:rgba(255,255,255,.18); }
.onb-progress__dot[data-on="true"]{ background:linear-gradient(92deg,var(--accent-2),var(--accent)); }

/* ---------- objective tracker (top-left) ---------- */
.onb-objective{
  position:absolute; top:64px; left:22px; max-width:min(360px,70vw);
  padding:12px 14px; pointer-events:none; animation:onb-fade .22s ease both;
}
.onb-objective__label{ font-size:calc(10px * var(--onb-scale)); letter-spacing:.18em; text-transform:uppercase; color:var(--muted); }
.onb-objective__row{ display:flex; align-items:center; gap:10px; margin-top:5px; }
.onb-objective__text{ font-size:calc(14.5px * var(--onb-scale)); font-weight:650; line-height:1.3; }
.onb-objective__meta{ margin-top:6px; font-size:calc(12px * var(--onb-scale)); color:var(--muted); display:flex; gap:12px; }
.onb-objective__count{ color:var(--accent-2); font-weight:700; }

/* ---------- hint toast (bottom-center, above card slot) ---------- */
.onb-toast{
  position:absolute; left:50%; bottom:186px; transform:translateX(-50%);
  display:flex; align-items:center; gap:10px; padding:11px 14px; pointer-events:none;
  font-size:calc(13.5px * var(--onb-scale)); animation:onb-rise .2s ease both;
}
.onb-toast__glyphs{ display:flex; gap:6px; }

/* ---------- help / controls overlay ---------- */
.onb-help{
  position:absolute; inset:0; pointer-events:auto; display:grid; place-items:center;
  background:radial-gradient(120% 90% at 50% 6%, rgba(255,138,76,.12), transparent 55%), rgba(6,8,13,.62);
  backdrop-filter:blur(7px); -webkit-backdrop-filter:blur(7px); animation:onb-fade .18s ease both;
}
.onb-help__card{ width:min(760px,94vw); max-height:88vh; overflow:auto; padding:26px 28px; animation:onb-rise .22s ease both; }
.onb-help__title{ margin:8px 0 2px; font-size:calc(24px * var(--onb-scale)); font-weight:800; letter-spacing:-.01em; }
.onb-help__sub{ margin:0 0 18px; color:var(--muted); font-size:calc(13.5px * var(--onb-scale)); }
.onb-help__grid{ display:grid; grid-template-columns:repeat(auto-fit,minmax(300px,1fr)); gap:20px 28px; }
.onb-cat__title{ font-size:calc(11px * var(--onb-scale)); letter-spacing:.16em; text-transform:uppercase; color:var(--accent); margin-bottom:8px; }
.onb-row{ display:flex; align-items:center; justify-content:space-between; gap:14px; padding:7px 0; border-bottom:1px solid rgba(255,255,255,.06); }
.onb-row__label{ font-size:calc(13.5px * var(--onb-scale)); color:var(--ink); }
.onb-row__keys{ display:flex; gap:6px; flex-wrap:wrap; justify-content:flex-end; }
.onb-row__unbound{ font-size:calc(12px * var(--onb-scale)); color:var(--muted); font-style:italic; }
.onb-help__foot{ display:flex; gap:10px; justify-content:flex-end; margin-top:22px; flex-wrap:wrap; }

/* ---------- buttons ---------- */
.onb-btn{
  pointer-events:auto; cursor:pointer; font:inherit; font-size:calc(13px * var(--onb-scale)); font-weight:650;
  color:var(--ink); background:rgba(255,255,255,.08); border:1px solid var(--hairline);
  border-radius:10px; padding:9px 14px; transition:background .16s ease, transform .16s ease, box-shadow .16s ease;
}
.onb-btn:hover{ background:rgba(255,255,255,.14); }
.onb-btn:active{ transform:translateY(1px); }
.onb-btn:focus-visible{ outline:2px solid var(--accent); outline-offset:2px; }
.onb-btn--ghost{ background:transparent; color:var(--muted); }
.onb-btn--ghost:hover{ color:var(--ink); background:rgba(255,255,255,.08); }
.onb-btn--primary{ color:#0b0d12; border-color:transparent; background:linear-gradient(92deg,var(--accent-2),var(--accent)); box-shadow:0 6px 20px rgba(255,138,76,.28); }
.onb-btn--primary:hover{ filter:brightness(1.05); }

/* ---------- motion ---------- */
@keyframes onb-rise{ from{ opacity:0; transform:translateX(-50%) translateY(10px);} to{ opacity:1; transform:translateX(-50%) translateY(0);} }
@keyframes onb-fade{ from{ opacity:0;} to{ opacity:1;} }
.onb-help__card, .onb-objective{ animation-name:onb-fade; }

@media (prefers-reduced-motion: reduce){
  .onb-card,.onb-toast,.onb-help,.onb-help__card,.onb-objective{ animation:none !important; }
  .onb-btn{ transition:none !important; }
}
.onb-root[data-reduced="true"] .onb-card,
.onb-root[data-reduced="true"] .onb-toast,
.onb-root[data-reduced="true"] .onb-help,
.onb-root[data-reduced="true"] .onb-help__card,
.onb-root[data-reduced="true"] .onb-objective{ animation:none !important; }
`;

/** Inject the onboarding stylesheet exactly once. Safe to call from any component mount. */
export function ensureStyles(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = CSS;
  document.head.appendChild(el);
}
