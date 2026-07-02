// Pure economy rules — no I/O, no store, no globals. The client store (SP source of truth)
// and the (v4) server validator both call THESE functions, so there is exactly one code path
// for every money/XP mutation. Keep every function referentially transparent.
import type { CharacterId } from "@sunbreak/shared";
import { LAUNDER_HAIRCUT, MILESTONES, PERKS, SKILL_IDS, SKILL_K, SKILL_MAX } from "./constants";
import type {
  CatalogItem,
  Money,
  PerkState,
  Result,
  Skill,
  SkillId,
  Skills,
  Wallet,
} from "./types";

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const nonNeg = (n: number) => (n > 0 ? n : 0);

// ── constructors ────────────────────────────────────────────────────────────
export const emptyMoney = (clean = 0, dirty = 0): Money => ({
  clean: nonNeg(Math.round(clean)),
  dirty: nonNeg(Math.round(dirty)),
});

export const initWallet = (clean = 0, dirty = 0, bank = 0): Wallet => ({
  cash: emptyMoney(clean, dirty),
  bank: nonNeg(Math.round(bank)),
});

export const initSkills = (): Skills =>
  SKILL_IDS.reduce((acc, id) => {
    acc[id] = { xp: 0 };
    return acc;
  }, {} as Skills);

// ── money helpers ─────────────────────────────────────────────────────────────
/** Total cash on hand (clean + dirty). */
export const onHand = (m: Money): number => m.clean + m.dirty;

/** Everything a wallet is worth. */
export const netWorth = (w: Wallet): number => onHand(w.cash) + w.bank;

/** Spendable pool for a legit purchase (dirty cash is NOT spendable until laundered). */
export const spendable = (w: Wallet, allowBank = false): number =>
  w.cash.clean + (allowBank ? w.bank : 0);

export function canAfford(w: Wallet, price: number, allowBank = false): boolean {
  return spendable(w, allowBank) >= Math.max(0, Math.round(price));
}

/** Add money to a pool. Amount is rounded; the target never goes negative. */
export function addToMoney(m: Money, amount: number, dirty = false): Money {
  const a = Math.round(amount);
  return dirty
    ? { clean: m.clean, dirty: nonNeg(m.dirty + a) }
    : { clean: nonNeg(m.clean + a), dirty: m.dirty };
}

/** Credit a wallet (clean on-hand by default; dirty pool or bank via flags). */
export function credit(
  w: Wallet,
  amount: number,
  opts: { dirty?: boolean; toBank?: boolean } = {},
): Wallet {
  const a = nonNeg(Math.round(amount));
  if (a === 0) return w;
  if (opts.toBank) return { ...w, bank: w.bank + a };
  return { ...w, cash: addToMoney(w.cash, a, opts.dirty) };
}

/**
 * Debit a wallet by `price`, drawing clean on-hand first, then the bank (if allowed).
 * Returns a failure result if the wallet cannot cover it — never partially charges.
 */
export function debit(w: Wallet, price: number, allowBank = false): Result<Wallet> {
  const p = Math.max(0, Math.round(price));
  if (p === 0) return { ok: true, value: w };
  if (!canAfford(w, p, allowBank)) return { ok: false, reason: "insufficient_funds" };

  const fromClean = Math.min(w.cash.clean, p);
  const fromBank = p - fromClean;
  return {
    ok: true,
    value: {
      cash: { clean: w.cash.clean - fromClean, dirty: w.cash.dirty },
      bank: w.bank - fromBank,
    },
  };
}

/** Move `amount` between on-hand clean and the bank (sign-agnostic helper). */
export function moveBank(w: Wallet, amount: number): Result<Wallet> {
  const a = Math.round(amount);
  if (a === 0) return { ok: true, value: w };
  if (a > 0) {
    // deposit
    if (w.cash.clean < a) return { ok: false, reason: "insufficient_funds" };
    return { ok: true, value: { cash: { ...w.cash, clean: w.cash.clean - a }, bank: w.bank + a } };
  }
  // withdraw
  const w2 = -a;
  if (w.bank < w2) return { ok: false, reason: "insufficient_funds" };
  return { ok: true, value: { cash: { ...w.cash, clean: w.cash.clean + w2 }, bank: w.bank - w2 } };
}

// ── purchases ─────────────────────────────────────────────────────────────────
/** Price after a clamped 0..1 discount. */
export const priceOf = (item: Pick<CatalogItem, "price">, discount = 0): number =>
  Math.max(0, Math.round(item.price * (1 - clamp01(discount))));

/**
 * Validate + apply a purchase against a wallet. Pure: returns the new wallet on success.
 * Ownership/gating are checked by the caller (they need catalog + skills context), but
 * this enforces the money math so the server can re-run it verbatim.
 */
export function applyPurchase(
  w: Wallet,
  item: CatalogItem,
  discount = 0,
  allowBank = false,
): Result<Wallet> {
  return debit(w, priceOf(item, discount), allowBank);
}

/** Is the skill milestone gate (if any) satisfied? */
export function meetsRequirement(skills: Skills, item: CatalogItem): boolean {
  if (!item.requires) return true;
  return skillLevelFromXp(skills[item.requires.skill]?.xp ?? 0) >= item.requires.level;
}

// ── laundering & sinks ─────────────────────────────────────────────────────────
/** Convert dirty→clean through fronts at a haircut. `capacity` caps the amount per call. */
export function launder(
  m: Money,
  amount: number,
  haircut = LAUNDER_HAIRCUT,
  capacity = Number.POSITIVE_INFINITY,
): Result<Money> {
  const want = Math.min(Math.round(amount), m.dirty, Math.floor(capacity));
  if (want <= 0) return { ok: false, reason: "no_dirty" };
  const net = Math.round(want * (1 - clamp01(haircut)));
  return { ok: true, value: { clean: m.clean + net, dirty: m.dirty - want } };
}

/** Apply a heat/hospital/bribe cost. Drains clean, then bank, then dirty (never negative). */
export function applyHeatCost(w: Wallet, cost: number): Wallet {
  let remaining = nonNeg(Math.round(cost));
  const fromClean = Math.min(w.cash.clean, remaining);
  remaining -= fromClean;
  const fromBank = Math.min(w.bank, remaining);
  remaining -= fromBank;
  const fromDirty = Math.min(w.cash.dirty, remaining);
  return {
    cash: { clean: w.cash.clean - fromClean, dirty: w.cash.dirty - fromDirty },
    bank: w.bank - fromBank,
  };
}

// ── skills & progression ────────────────────────────────────────────────────────
/** Deterministic 0..100 level from raw XP. Inverse: xp ≈ (level / SKILL_K)². */
export const skillLevelFromXp = (xp: number): number =>
  Math.max(0, Math.min(SKILL_MAX, Math.floor(Math.sqrt(nonNeg(xp)) * SKILL_K)));

/** XP needed to reach a given level (for progress bars). */
export const xpForLevel = (level: number): number =>
  Math.ceil((Math.max(0, Math.min(SKILL_MAX, level)) / SKILL_K) ** 2);

/** Immutably add XP to one skill. */
export function addXp(skills: Skills, id: SkillId, amount: number): Skills {
  if (amount <= 0) return skills;
  const cur: Skill = skills[id] ?? { xp: 0 };
  return { ...skills, [id]: { xp: nonNeg(cur.xp + amount) } };
}

/** Milestone thresholds already crossed at a given level. */
export const reachedMilestones = (level: number): number[] =>
  MILESTONES.filter((m) => level >= m);

/** Compute the read-only perk snapshot from raw skills. */
export function computePerks(skills: Skills): PerkState {
  const levels = {} as Record<SkillId, number>;
  const perks: string[] = [];
  for (const id of SKILL_IDS) {
    const level = skillLevelFromXp(skills[id]?.xp ?? 0);
    levels[id] = level;
    const table = PERKS[id];
    if (table) {
      for (const m of reachedMilestones(level)) {
        const perk = table[m as (typeof MILESTONES)[number]];
        if (perk) perks.push(perk);
      }
    }
  }
  return { levels, perks };
}

// ── passive income ──────────────────────────────────────────────────────────────
/** Whole-minute income for a delta. Sub-minute remainders are intentionally not paid. */
export const accrueIncome = (incomePerMin: number, dtMs: number): number =>
  nonNeg(Math.floor(incomePerMin) * Math.max(0, Math.floor(dtMs / 60_000)));

/** Minutes that a delta represents (used to advance the accrual clock precisely). */
export const wholeMinutes = (dtMs: number): number => Math.max(0, Math.floor(dtMs / 60_000));

// Keep a value-referencing use of CharacterId so tree-shakers keep the type import honest.
export type WalletOwner = CharacterId;
