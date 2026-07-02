// Objective evaluator registry — pure done/failed logic keyed by objective type. Kind controllers
// own spawning + progress tallying; they delegate the terminal checks here so the "when is this
// objective satisfied/blown?" rules live in one small, testable place.

export type ObjectiveType = "reach" | "score" | "deliver";

export interface EvalCtx {
  /** Sub-objectives completed (checkpoints hit / delivery legs done). */
  index: number;
  /** Total sub-objectives. */
  count: number;
  score: number;
  goal: number;
  /** Time remaining in ms (Infinity when untimed). */
  remainingMs: number;
}

export interface EvalResult {
  done: boolean;
  failed: boolean;
}

export const evaluators: Record<ObjectiveType, (c: EvalCtx) => EvalResult> = {
  reach: (c) => ({ done: c.index >= c.count, failed: c.remainingMs <= 0 }),
  score: (c) => ({ done: c.score >= c.goal, failed: c.remainingMs <= 0 && c.score < c.goal }),
  deliver: (c) => ({ done: c.index >= c.count, failed: c.remainingMs <= 0 }),
};
