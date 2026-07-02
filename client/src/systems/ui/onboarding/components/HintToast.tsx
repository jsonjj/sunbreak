// Contextual-hint toast — a single visible slot (FIFO queue lives in the store). Auto-dismiss
// is driven by the runner's frame timer, so it works even if this component isn't mounted.
// role="status" + aria-live="polite" so screen readers announce it without stealing focus.
import { useOnboardingStore } from "../store";
import { Glyphs } from "./Glyph";

export function HintToast() {
  const hint = useOnboardingStore((s) => s.currentHint);
  if (!hint) return null;

  return (
    <div className="onb-toast onb-panel" role="status" aria-live="polite">
      {hint.glyphs.length > 0 && (
        <span className="onb-toast__glyphs" aria-hidden>
          <Glyphs glyphs={hint.glyphs} />
        </span>
      )}
      <span>{hint.text}</span>
    </div>
  );
}
