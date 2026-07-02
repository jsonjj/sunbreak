// Data-driven first-run controls tutorial. Each step verifies a REAL observed input and
// auto-advances after `timeoutMs` so the player can never soft-lock. The controller in
// `runner.ts` evaluates these against events from the bus.
import { InputAction } from "@sunbreak/shared";
import type { OnbEventKey, MoveDir } from "./bus";
import type { I18nKey } from "./i18n/en";

export type StepReq =
  | { kind: "moveAll" } // all four movement directions observed
  | { kind: "look"; threshold: number } // cumulative camera look magnitude
  | { kind: "event"; on: OnbEventKey }; // a single event observed once

export interface FirstRunStep {
  id: string;
  promptKey: I18nKey;
  subKey: I18nKey;
  /** Actions whose glyph chips are shown on the card. */
  glyphs: InputAction[];
  req: StepReq;
  timeoutMs: number;
}

/** Movement chips, in on-screen reading order (maps 1:1 to a MoveDir for per-dir checks). */
export const MOVE_CHIP_DIRS: readonly MoveDir[] = ["fwd", "left", "back", "right"];
export const MOVE_CHIP_ACTIONS: readonly InputAction[] = [
  InputAction.MoveForward,
  InputAction.MoveLeft,
  InputAction.MoveBack,
  InputAction.MoveRight,
];

export const LOOK_THRESHOLD = 0.6; // ~35° of accumulated camera movement

export const firstRunSteps: readonly FirstRunStep[] = [
  {
    id: "move",
    promptKey: "onb.tut.move",
    subKey: "onb.tut.move.sub",
    glyphs: [...MOVE_CHIP_ACTIONS],
    req: { kind: "moveAll" },
    timeoutMs: 14000,
  },
  {
    id: "look",
    promptKey: "onb.tut.look",
    subKey: "onb.tut.look.sub",
    glyphs: [],
    req: { kind: "look", threshold: LOOK_THRESHOLD },
    timeoutMs: 10000,
  },
  {
    id: "sprint",
    promptKey: "onb.tut.sprint",
    subKey: "onb.tut.sprint.sub",
    glyphs: [InputAction.Sprint],
    req: { kind: "event", on: "player:sprint" },
    timeoutMs: 10000,
  },
  {
    id: "jump",
    promptKey: "onb.tut.jump",
    subKey: "onb.tut.jump.sub",
    glyphs: [InputAction.Jump],
    req: { kind: "event", on: "player:jump" },
    timeoutMs: 10000,
  },
  {
    id: "interact",
    promptKey: "onb.tut.interact",
    subKey: "onb.tut.interact.sub",
    glyphs: [InputAction.Interact],
    req: { kind: "event", on: "player:interact" },
    timeoutMs: 10000,
  },
];

export const getStep = (index: number): FirstRunStep | undefined => firstRunSteps[index];
export const stepCount = firstRunSteps.length;
