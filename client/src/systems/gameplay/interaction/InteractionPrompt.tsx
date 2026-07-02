// DOM prompt overlay — the "[E] Enter · Val's Taxi" pill. Mount ONCE in the HUD root as a sibling
// of <Canvas> (never inside it) so its re-renders never touch the R3F tree. Reads only the shared
// interaction store. Premium, low-chroma glass styling so it stays legible over any scene.

import { useInteractionStore } from "./store";

const RING_R = 19;
const RING_C = 2 * Math.PI * RING_R;

const CSS = `
.sbk-iprompt__card{animation:sbk-iprompt-in 180ms cubic-bezier(.2,.7,.2,1) both}
@keyframes sbk-iprompt-in{from{opacity:0;transform:translateY(8px) scale(.985)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion: reduce){.sbk-iprompt__card{animation:none}}
.sbk-iprompt__key,.sbk-iprompt__seckey{font-variant-numeric:tabular-nums}
`;

const FONT =
  "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif";

export function InteractionPrompt() {
  const focusedId = useInteractionStore((s) => s.focusedId);
  const prompt = useInteractionStore((s) => s.prompt);
  const holdProgress = useInteractionStore((s) => s.holdProgress);

  if (!prompt) return null;
  const isHold = typeof prompt.hold === "number" && prompt.hold > 0;

  return (
    <div
      className="sbk-iprompt"
      style={{
        position: "fixed",
        left: "50%",
        bottom: "9%",
        transform: "translateX(-50%)",
        display: "flex",
        justifyContent: "center",
        pointerEvents: "none",
        zIndex: 45,
        fontFamily: FONT,
      }}
    >
      <style>{CSS}</style>
      <div
        key={focusedId ?? "prompt"}
        className="sbk-iprompt__card"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "9px 14px 9px 10px",
          borderRadius: 14,
          color: "#eef1f7",
          background: "linear-gradient(180deg, rgba(20,23,31,0.66), rgba(11,13,18,0.66))",
          border: "1px solid rgba(255,255,255,0.12)",
          boxShadow: "0 10px 34px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,255,255,0.06)",
          backdropFilter: "blur(14px) saturate(140%)",
          WebkitBackdropFilter: "blur(14px) saturate(140%)",
        }}
      >
        {/* key badge + optional hold ring */}
        <div
          style={{
            position: "relative",
            width: 46,
            height: 46,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flex: "0 0 auto",
          }}
        >
          {isHold && (
            <svg
              width={46}
              height={46}
              viewBox="0 0 46 46"
              style={{ position: "absolute", inset: 0 }}
              aria-hidden
            >
              <circle
                cx={23}
                cy={23}
                r={RING_R}
                fill="none"
                stroke="rgba(255,255,255,0.14)"
                strokeWidth={3}
              />
              <circle
                cx={23}
                cy={23}
                r={RING_R}
                fill="none"
                stroke="#ffb454"
                strokeWidth={3}
                strokeLinecap="round"
                strokeDasharray={RING_C}
                strokeDashoffset={RING_C * (1 - Math.min(1, Math.max(0, holdProgress)))}
                transform="rotate(-90 23 23)"
              />
            </svg>
          )}
          <span
            className="sbk-iprompt__key"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              minWidth: 30,
              height: 30,
              padding: "0 7px",
              borderRadius: 9,
              fontSize: 15,
              fontWeight: 800,
              letterSpacing: 0.3,
              color: "#f6f8fc",
              background: "linear-gradient(180deg, rgba(255,255,255,0.16), rgba(255,255,255,0.04))",
              border: "1px solid rgba(255,255,255,0.20)",
              boxShadow: "inset 0 -2px 4px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.20)",
            }}
          >
            {prompt.key}
          </span>
        </div>

        {/* verb + label */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, paddingRight: 2 }}>
          <span style={{ fontSize: 15, fontWeight: 650, letterSpacing: 0.2 }}>{prompt.verb}</span>
          {prompt.label && (
            <span style={{ fontSize: 13, fontWeight: 500, color: "rgba(238,241,247,0.60)" }}>
              {prompt.label}
            </span>
          )}
        </div>

        {/* secondary action */}
        {prompt.secondary && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              marginLeft: 4,
              paddingLeft: 12,
              borderLeft: "1px solid rgba(255,255,255,0.12)",
            }}
          >
            <span
              className="sbk-iprompt__seckey"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: 24,
                height: 24,
                padding: "0 6px",
                borderRadius: 7,
                fontSize: 12,
                fontWeight: 800,
                color: "#e7eaf2",
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.16)",
              }}
            >
              {prompt.secondary.key}
            </span>
            <span style={{ fontSize: 13, fontWeight: 500, color: "rgba(238,241,247,0.72)" }}>
              {prompt.secondary.verb}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
