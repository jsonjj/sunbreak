// Tiny id helpers. `nanoid` is NOT in the pre-installed dependency set (Wave-2 protocol §d),
// so we generate stable-enough ids from crypto.randomUUID with a Math.random fallback.

const rand = (): string => {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID().slice(0, 8);
  return Math.random().toString(36).slice(2, 10);
};

/** Prefixed run id, e.g. "run_race_neon_mile_ab12cd34". */
export const makeRunId = (activityId: string): string => `run_${activityId}_${rand()}`;

/** Prefixed generic id (toasts, blips, nodes). Always starts with `act_`. */
export const makeActId = (scope: string): string => `act_${scope}_${rand()}`;
