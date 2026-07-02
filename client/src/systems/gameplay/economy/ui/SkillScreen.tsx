// Skills modal — the nine organic skills with live 0–100 levels, progress toward the next
// milestone, and unlocked perks. Read-only view of progression state.
import { MILESTONES, SKILL_IDS, SKILL_LABELS } from "../constants";
import { usePerks, useSkills } from "../hooks";
import { skillLevelFromXp } from "../rules";
import type { SkillId } from "../types";

const nextMilestone = (level: number): number => MILESTONES.find((m) => m > level) ?? 100;

const perkLabel = (perkId: string): string => {
  const mid = perkId.split(".")[1] ?? perkId;
  return mid.charAt(0).toUpperCase() + mid.slice(1);
};

export function SkillScreen({ onClose }: { onClose: () => void }) {
  const skills = useSkills();
  const { perks } = usePerks();

  const onBackdrop = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div className="econ-scrim" onMouseDown={onBackdrop}>
      <div
        className="econ-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Skills"
        style={{ width: "min(620px, 96vw)" }}
      >
        <div className="econ-panel__top">
          <div className="econ-panel__kicker">Progression</div>
          <h2 className="econ-panel__title">Skills</h2>
          <button type="button" className="econ-panel__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="econ-body">
          {SKILL_IDS.map((id: SkillId) => {
            const xp = skills[id]?.xp ?? 0;
            const level = skillLevelFromXp(xp);
            const target = nextMilestone(level);
            const skillPerks = perks.filter((p) => p.startsWith(`${id}.`));
            return (
              <div key={id} className="econ-skill">
                <div className="econ-skill__head">
                  <span className="econ-skill__name">{SKILL_LABELS[id]}</span>
                  <span className="econ-skill__lvl">
                    {level} <span>/ 100</span>
                  </span>
                </div>
                <div className="econ-bar">
                  <div className="econ-bar__fill" style={{ width: `${level}%` }} />
                </div>
                <div className="econ-skill__perks">
                  {skillPerks.length > 0 ? (
                    skillPerks.map((p) => (
                      <span key={p} className="econ-perk">
                        {perkLabel(p)}
                      </span>
                    ))
                  ) : (
                    <span className="econ-perk" style={{ opacity: 0.6 }}>
                      Next perk at {target}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
