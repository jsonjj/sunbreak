// Top-left objective banner for the intro mission. Shows the current beat, an optional
// distance-to-marker, and a hit counter for multi-goal beats. aria-live announces beat changes.
import { useOnboardingStore } from "../store";
import { t } from "../i18n/en";

export function ObjectiveTracker() {
  const phase = useOnboardingStore((s) => s.phase);
  const objectiveKey = useOnboardingStore((s) => s.objectiveKey);
  const titleKey = useOnboardingStore((s) => s.missionTitleKey);
  const markerLabelKey = useOnboardingStore((s) => s.markerLabelKey);
  const markerDistance = useOnboardingStore((s) => s.markerDistance);
  const goal = useOnboardingStore((s) => s.beatGoal);
  const progress = useOnboardingStore((s) => s.beatProgress);

  if (phase !== "intro" || !objectiveKey) return null;

  const distance =
    markerDistance != null ? `${markerLabelKey ? `${t(markerLabelKey)} · ` : ""}${Math.round(markerDistance)} m` : null;

  return (
    <div className="onb-objective onb-panel" aria-live="polite">
      <div className="onb-objective__label">{titleKey ? t(titleKey) : "Objective"}</div>
      <div className="onb-objective__row">
        <span className="onb-objective__text">{t(objectiveKey)}</span>
      </div>
      <div className="onb-objective__meta">
        {distance && <span>{distance}</span>}
        {goal > 1 && (
          <span>
            <span className="onb-objective__count">{progress}</span>
            {` / ${goal}`}
          </span>
        )}
      </div>
    </div>
  );
}
