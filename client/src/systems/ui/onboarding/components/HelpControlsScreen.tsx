// Help / Controls overlay — the exported surface the integrator mounts (pause-menu entry or
// F1 hotkey). Categorised bindings read from the LIVE input config + glyphs, plus Replay/Skip
// tutorial. Self-gates on the store's `helpOpen`, so mounting it unconditionally is fine.
// Accessible: focus-trapped modal, Escape to close, visible focus rings.
import { useEffect, useRef } from "react";
import { InputAction } from "@sunbreak/shared";
import { useOnboardingStore } from "../store";
import { glyphsForAction, moveGlyphs } from "../glyphs";
import { replayOnboarding, skipOnboarding } from "../runner";
import { ensureStyles } from "../styles";
import { t } from "../i18n/en";
import type { I18nKey } from "../i18n/en";
import { Glyphs } from "./Glyph";

interface Row {
  labelKey: I18nKey;
  glyphs: string[];
}
interface Category {
  titleKey: I18nKey;
  rows: Row[];
}

function buildCategories(): Category[] {
  return [
    {
      titleKey: "onb.help.cat.onFoot",
      rows: [
        { labelKey: "onb.ctl.move", glyphs: moveGlyphs() },
        { labelKey: "onb.ctl.look", glyphs: ["Mouse"] },
        { labelKey: "onb.ctl.sprint", glyphs: glyphsForAction(InputAction.Sprint) },
        { labelKey: "onb.ctl.walk", glyphs: glyphsForAction(InputAction.Walk) },
        { labelKey: "onb.ctl.crouch", glyphs: glyphsForAction(InputAction.Crouch) },
        { labelKey: "onb.ctl.jump", glyphs: glyphsForAction(InputAction.Jump) },
        { labelKey: "onb.ctl.interact", glyphs: glyphsForAction(InputAction.Interact) },
      ],
    },
    {
      titleKey: "onb.help.cat.vehicle",
      rows: [
        { labelKey: "onb.ctl.enterExit", glyphs: glyphsForAction(InputAction.EnterExitVehicle) },
        { labelKey: "onb.ctl.accelerate", glyphs: glyphsForAction(InputAction.Accelerate) },
        { labelKey: "onb.ctl.brake", glyphs: glyphsForAction(InputAction.Brake) },
        { labelKey: "onb.ctl.steer", glyphs: ["A", "D"] },
        { labelKey: "onb.ctl.handbrake", glyphs: glyphsForAction(InputAction.Handbrake) },
      ],
    },
    {
      titleKey: "onb.help.cat.combat",
      rows: [
        { labelKey: "onb.ctl.fire", glyphs: glyphsForAction(InputAction.Fire) },
        { labelKey: "onb.ctl.aim", glyphs: glyphsForAction(InputAction.Aim) },
        { labelKey: "onb.ctl.reload", glyphs: glyphsForAction(InputAction.Reload) },
      ],
    },
    {
      titleKey: "onb.help.cat.camera",
      rows: [
        { labelKey: "onb.ctl.look", glyphs: ["Mouse"] },
        { labelKey: "onb.ctl.cycleCamera", glyphs: glyphsForAction(InputAction.CycleCamera) },
      ],
    },
    {
      titleKey: "onb.help.cat.general",
      rows: [
        { labelKey: "onb.ctl.pause", glyphs: glyphsForAction(InputAction.Pause) },
        { labelKey: "onb.ctl.help", glyphs: ["F1"] },
      ],
    },
  ];
}

export function HelpControlsScreen() {
  const helpOpen = useOnboardingStore((s) => s.helpOpen);
  const closeHelp = useOnboardingStore((s) => s.closeHelp);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ensureStyles();
  }, []);

  useEffect(() => {
    if (!helpOpen) return;
    const card = cardRef.current;
    card?.querySelector<HTMLElement>("button")?.focus();

    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeHelp();
        return;
      }
      if (e.key !== "Tab" || !card) return;
      const focusable = [...card.querySelectorAll<HTMLElement>("button, [tabindex]:not([tabindex='-1'])")];
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [helpOpen, closeHelp]);

  if (!helpOpen) return null;
  const categories = buildCategories();

  return (
    <div
      className="onb-help"
      role="presentation"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) closeHelp();
      }}
    >
      <div
        className="onb-help__card onb-panel"
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-label={t("onb.help.title")}
      >
        <span className="onb-kicker">SUNBREAK</span>
        <h2 className="onb-help__title">{t("onb.help.title")}</h2>
        <p className="onb-help__sub">{t("onb.help.subtitle")}</p>

        <div className="onb-help__grid">
          {categories.map((cat) => (
            <section key={cat.titleKey} aria-label={t(cat.titleKey)}>
              <div className="onb-cat__title">{t(cat.titleKey)}</div>
              {cat.rows.map((row) => (
                <div className="onb-row" key={row.labelKey}>
                  <span className="onb-row__label">{t(row.labelKey)}</span>
                  <span className="onb-row__keys">
                    <Glyphs glyphs={row.glyphs} />
                  </span>
                </div>
              ))}
            </section>
          ))}
        </div>

        <div className="onb-help__foot">
          <button type="button" className="onb-btn onb-btn--ghost" onClick={skipOnboarding}>
            {t("onb.help.skip")}
          </button>
          <button type="button" className="onb-btn" onClick={replayOnboarding}>
            {t("onb.help.replay")}
          </button>
          <button type="button" className="onb-btn onb-btn--primary" onClick={closeHelp}>
            {t("onb.help.close")}
          </button>
        </div>
      </div>
    </div>
  );
}
