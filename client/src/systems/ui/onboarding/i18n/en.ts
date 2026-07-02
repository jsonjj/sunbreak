// Onboarding string table (en). All player-facing prompts/hints/objectives route through
// `t()` so localization is a drop-in later. Keys are namespaced `onb.*`.
export const en = {
  // First-run controls tutorial
  "onb.tut.title": "Getting started",
  "onb.tut.move": "Move around",
  "onb.tut.move.sub": "Use the movement keys to walk in every direction.",
  "onb.tut.look": "Look around",
  "onb.tut.look.sub": "Move the mouse to aim the camera.",
  "onb.tut.sprint": "Sprint",
  "onb.tut.sprint.sub": "Hold sprint to break into a run.",
  "onb.tut.jump": "Jump",
  "onb.tut.jump.sub": "Tap jump to hop over a curb.",
  "onb.tut.interact": "Interact",
  "onb.tut.interact.sub": "Press interact near people and objects.",
  "onb.tut.skip": "Skip",
  "onb.tut.skipStep": "Skip step",
  "onb.tut.done": "You're set — let's ride.",

  // Intro mission "First Gear"
  "onb.mission.firstGear.title": "First Gear",
  "onb.beat.walk": "Get up and head for the garage door.",
  "onb.beat.drive.enter": "Take Mac's ride — get in the car.",
  "onb.beat.drive.go": "Drive to the Neon Mile lot.",
  "onb.beat.shoot": "Sparks set up cans — hit all five.",
  "onb.beat.done": "Nice shooting. The Verano's yours.",
  "onb.marker.door": "Garage door",
  "onb.marker.neonMile": "Neon Mile lot",
  "onb.objective.progress": "{done}/{total}",

  // Contextual hints
  "onb.hint.enterVehicle": "Press {glyph} to get in the vehicle.",
  "onb.hint.openMap": "Press {glyph} to open the map.",
  "onb.hint.sprint": "Hold {glyph} to sprint.",
  "onb.hint.pause": "Press {glyph} to pause.",
  "onb.hint.help": "Press {glyph} for controls & help.",
  "onb.hint.reload": "Press {glyph} to reload.",

  // Help / Controls screen
  "onb.help.title": "Controls & Help",
  "onb.help.subtitle": "Everything you need to get around Santa Vista.",
  "onb.help.cat.onFoot": "On foot",
  "onb.help.cat.vehicle": "Vehicle",
  "onb.help.cat.combat": "Combat",
  "onb.help.cat.camera": "Camera",
  "onb.help.cat.general": "General",
  "onb.help.replay": "Replay tutorial",
  "onb.help.skip": "Skip tutorial",
  "onb.help.close": "Close",
  "onb.help.unbound": "Unbound",

  // Control labels (used by the Help table + glyph rows)
  "onb.ctl.move": "Move",
  "onb.ctl.look": "Look",
  "onb.ctl.sprint": "Sprint",
  "onb.ctl.walk": "Walk",
  "onb.ctl.crouch": "Crouch",
  "onb.ctl.jump": "Jump",
  "onb.ctl.interact": "Interact",
  "onb.ctl.enterExit": "Enter / exit vehicle",
  "onb.ctl.accelerate": "Accelerate",
  "onb.ctl.brake": "Brake / reverse",
  "onb.ctl.steer": "Steer",
  "onb.ctl.handbrake": "Handbrake",
  "onb.ctl.fire": "Fire",
  "onb.ctl.aim": "Aim",
  "onb.ctl.reload": "Reload",
  "onb.ctl.cycleCamera": "Cycle camera",
  "onb.ctl.pause": "Pause",
  "onb.ctl.help": "Controls & help",
} as const;

export type I18nKey = keyof typeof en;

/**
 * Minimal translator. Unknown keys pass through unchanged (so a raw string also works), and
 * `{token}` placeholders are filled from `vars`.
 */
export function t(key: I18nKey | (string & {}), vars?: Record<string, string | number>): string {
  const table = en as Record<string, string>;
  let out = table[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) out = out.replace(`{${k}}`, String(v));
  }
  return out;
}
