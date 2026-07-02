// First-run controls card. Shows the active step's prompt, live glyphs, per-input checkmarks,
// and overall progress. Appears once the player has captured the mouse (so look/move make
// sense) and auto-advances via the runner so it can never soft-lock.
import { useOnboardingStore } from "../store";
import { useInputStore } from "@/stores/input.store";
import { getStep, stepCount, MOVE_CHIP_ACTIONS, MOVE_CHIP_DIRS } from "../steps";
import { firstGlyph, glyphsForAction } from "../glyphs";
import { skipCurrentStep, skipOnboarding } from "../runner";
import { t } from "../i18n/en";

export function KeyPromptCard() {
  const phase = useOnboardingStore((s) => s.phase);
  const stepIndex = useOnboardingStore((s) => s.stepIndex);
  const movedDirs = useOnboardingStore((s) => s.movedDirs);
  const lookAmount = useOnboardingStore((s) => s.lookAmount);
  const locked = useInputStore((s) => s.locked);

  const step = getStep(stepIndex);
  if (phase !== "firstRun" || !locked || !step) return null;

  const lookDone = step.req.kind === "look" && lookAmount >= step.req.threshold;
  const eventGlyph = step.glyphs[0];

  return (
    <div className="onb-card onb-panel" role="status" aria-live="polite" aria-label={t("onb.tut.title")}>
      <div className="onb-card__head">
        <span className="onb-kicker">{t("onb.tut.title")}</span>
        <span className="onb-kicker" aria-hidden>
          {stepIndex + 1} / {stepCount}
        </span>
      </div>
      <h3 className="onb-card__title">{t(step.promptKey)}</h3>
      <p className="onb-card__sub">{t(step.subKey)}</p>

      {step.req.kind === "moveAll" && (
        <div className="onb-card__glyphs">
          {MOVE_CHIP_ACTIONS.map((action, i) => {
            const dir = MOVE_CHIP_DIRS[i];
            const done = dir ? movedDirs.has(dir) : false;
            return (
              <div className="onb-glyph" key={dir ?? i}>
                <kbd className="onb-chip" data-done={done ? "true" : "false"}>
                  {firstGlyph(action)}
                </kbd>
                <span className="onb-glyph__check" data-done={done ? "true" : "false"}>
                  {done ? "✓" : ""}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {step.req.kind === "look" && (
        <div className="onb-card__glyphs">
          <div className="onb-glyph">
            <kbd className="onb-chip" data-done={lookDone ? "true" : "false"}>
              Mouse
            </kbd>
            <span className="onb-glyph__check" data-done={lookDone ? "true" : "false"}>
              {lookDone ? "✓" : ""}
            </span>
          </div>
        </div>
      )}

      {step.req.kind === "event" && eventGlyph != null && (
        <div className="onb-card__glyphs">
          {glyphsForAction(eventGlyph).map((g, i) => (
            <kbd className="onb-chip" key={`${g}-${i}`}>
              {g}
            </kbd>
          ))}
        </div>
      )}

      <div className="onb-card__foot">
        <div className="onb-progress" aria-hidden>
          {Array.from({ length: stepCount }, (_, i) => (
            <span className="onb-progress__dot" key={i} data-on={i <= stepIndex ? "true" : "false"} />
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="onb-btn onb-btn--ghost" onClick={skipCurrentStep}>
            {t("onb.tut.skipStep")}
          </button>
          <button type="button" className="onb-btn onb-btn--ghost" onClick={skipOnboarding}>
            {t("onb.tut.skip")}
          </button>
        </div>
      </div>
    </div>
  );
}
