// Economy & Progression — serializable data contracts (POJOs only, no live refs).
// Everything here is safe to JSON-serialize into a save file and (v4) re-run on the server.
import type { CharacterId } from "@sunbreak/shared";

/** On-hand money split by legality. `dirty` must be laundered before it counts as spendable. */
export type Money = { clean: number; dirty: number };

/** A single character's finances: cash on hand + a clean bank balance. */
export interface Wallet {
  cash: Money;
  bank: number;
}

/** The three player-facing storefronts (+ businesses, which produce passive income). */
export type ShopKind = "weapons" | "vehicles" | "clothing" | "business";

/** 1 (starter) .. 5 (endgame). Used for sort order and UI chips. */
export type ItemTier = 1 | 2 | 3 | 4 | 5;

/** The nine organic character skills (0–100 via XP curve). */
export type SkillId =
  | "shooting"
  | "strength"
  | "stealth"
  | "driving"
  | "stamina"
  | "lung"
  | "flying"
  | "hacking"
  | "charisma";

export interface Skill {
  xp: number;
}

export type Skills = Record<SkillId, Skill>;

/** A milestone-gated requirement (e.g. rifle tier needs Shooting 50). */
export interface SkillRequirement {
  skill: SkillId;
  level: number;
}

/** A purchasable catalog entry. `price` is in clean cash. */
export interface CatalogItem {
  id: string;
  name: string;
  price: number;
  tier: ItemTier;
  shop: ShopKind;
  blurb?: string;
  /** Optional skill-milestone gate — money alone is not enough. */
  requires?: SkillRequirement;
}

/** A business front — a catalog item that also accrues passive clean income. */
export interface BusinessItem extends CatalogItem {
  shop: "business";
  /** Clean cash produced per real-world minute while owned. */
  incomePerMin: number;
  /** Extra dirty→clean laundering capacity unlocked per minute by owning this front. */
  launderPerMin?: number;
}

/** A durable owned asset (business / property) tracked separately from consumable inventory. */
export interface OwnedAsset {
  id: string;
  kind: ShopKind;
  acquiredAt: number; // epoch ms
}

/** Read-only progression snapshot other systems poll (perks are never written externally). */
export interface PerkState {
  /** Current 0–100 level per skill. */
  levels: Record<SkillId, number>;
  /** Flat list of unlocked perk ids (e.g. "driving.grip.50"). */
  perks: string[];
}

/** Lifetime counters (flavor / progression HUD). */
export interface EconomyStats {
  earned: number;
  spent: number;
}

/** The full versioned save envelope handed to the Save subsystem. */
export interface EconomySave {
  version: number;
  active: CharacterId;
  wallets: Record<CharacterId, Wallet>;
  /** Shared crew stash (clean cash). */
  crew: number;
  skills: Skills;
  /** Owned consumable/unique item ids (weapons, vehicles, clothing). */
  inventory: string[];
  /** Owned durable assets (businesses / properties). */
  owned: OwnedAsset[];
  stats: EconomyStats;
  /** Epoch ms of the last passive-income accrual (for offline catch-up). */
  lastIncomeAt: number;
}

/** Discriminated result used by every pure rule that can fail. */
export type Result<T> = { ok: true; value: T } | { ok: false; reason: PurchaseFailure };

export type PurchaseFailure =
  | "insufficient_funds"
  | "already_owned"
  | "locked"
  | "unknown_item"
  | "no_dirty"
  | "invalid_amount";

/** Options accepted by the public money API. */
export interface AddMoneyOpts {
  /** Credit the dirty pool instead of clean (e.g. illegal score payouts). */
  dirty?: boolean;
  /** Credit the bank instead of on-hand cash. */
  toBank?: boolean;
  /** Target a specific character; defaults to the active one. */
  char?: CharacterId;
}

export interface SpendOpts {
  /** Allow drawing from the bank if on-hand clean cash is short. */
  allowBank?: boolean;
  char?: CharacterId;
}

export interface PayoutOpts {
  dirty?: boolean;
  /** Free-form label for telemetry ("score", "gig", "bonus"). */
  kind?: string;
}

export interface BuyOpts {
  /** 0..1 reputation/vendor discount applied to the sticker price. */
  discount?: number;
  allowBank?: boolean;
  char?: CharacterId;
}
