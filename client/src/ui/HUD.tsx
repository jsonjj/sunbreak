import { useHudStore } from "../stores/hud.store";
import { useInputStore } from "../stores/input.store";
import { input } from "../input/InputManager";

/** DOM HUD overlay — a sibling of <Canvas>, so its re-renders never touch the R3F tree. */
export function HUD() {
  const locked = useInputStore((s) => s.locked);
  const health = useHudStore((s) => s.health);
  const speedKmh = useHudStore((s) => s.speedKmh);

  return (
    <div className="hud">
      <div className="hud__brand">
        <span className="hud__logo">SUNBREAK</span>
        <span className="hud__tag">v0 · Verano</span>
      </div>

      <div className="hud__crosshair" aria-hidden />

      <div className="hud__stats">
        <div className="stat">
          <span className="stat__label">HEALTH</span>
          <span className="stat__value">{health}</span>
        </div>
        <div className="stat">
          <span className="stat__label">KM/H</span>
          <span className="stat__value">{speedKmh}</span>
        </div>
      </div>

      <div className="hud__controls">
        <kbd>W A S D</kbd> move · <kbd>Shift</kbd> sprint · <kbd>Space</kbd> jump · <kbd>C</kbd>{" "}
        crouch · <kbd>Mouse</kbd> look
      </div>

      {!locked && (
        <div
          className="capture"
          role="button"
          tabIndex={0}
          onClick={() => input.requestLock()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") input.requestLock();
          }}
        >
          <div className="capture__card">
            <div className="capture__kicker">SUNBREAK</div>
            <h1 className="capture__title">Click to play</h1>
            <p className="capture__sub">
              Capture your mouse to look around. Press <kbd>Esc</kbd> to release it.
            </p>
            <div className="capture__hint">WASD to move · Shift to sprint · Space to jump</div>
          </div>
        </div>
      )}
    </div>
  );
}
