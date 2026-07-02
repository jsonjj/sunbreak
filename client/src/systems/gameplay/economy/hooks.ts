// React selector hooks — narrow subscriptions so a cash change never re-renders unrelated UI.
// Consumers: the economy UI here, plus any other subsystem HUD that wants live money/skills.
import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import type { CharacterId } from "@sunbreak/shared";
import { useEconomy } from "./store/economyStore";
import { computePerks, skillLevelFromXp } from "./rules";
import type { PerkState, SkillId, Skills, Wallet } from "./types";

/** The active character id. */
export const useActiveChar = (): CharacterId => useEconomy((s) => s.active);

/** A character's full wallet (defaults to active). */
export const useWallet = (char?: CharacterId): Wallet =>
  useEconomy((s) => s.wallets[char ?? s.active]);

/** Active clean cash on hand — the single number the HUD shows most. */
export const useCash = (char?: CharacterId): number =>
  useEconomy((s) => s.wallets[char ?? s.active].cash.clean);

export const useDirtyCash = (char?: CharacterId): number =>
  useEconomy((s) => s.wallets[char ?? s.active].cash.dirty);

export const useBank = (char?: CharacterId): number =>
  useEconomy((s) => s.wallets[char ?? s.active].bank);

/** Shared crew stash. */
export const useCrew = (): number => useEconomy((s) => s.crew);

/** Raw skills map. */
export const useSkills = (): Skills => useEconomy((s) => s.skills);

/** A single skill's current 0–100 level. */
export const useSkillLevel = (id: SkillId): number =>
  useEconomy((s) => skillLevelFromXp(s.skills[id]?.xp ?? 0));

/** Read-only perk snapshot. Subscribes to `skills` (ref-stable) and memoizes the derivation. */
export const usePerks = (): PerkState => {
  const skills = useEconomy((s) => s.skills);
  return useMemo(() => computePerks(skills), [skills]);
};

/** Owned unique item ids. */
export const useInventory = (): string[] => useEconomy(useShallow((s) => s.inventory));

/** True if a given item/asset is owned (stable boolean subscription). */
export const useOwnsAsset = (id: string): boolean =>
  useEconomy((s) => s.inventory.includes(id) || s.owned.some((a) => a.id === id));

/** Lifetime earned/spent counters. */
export const useEconomyStats = () => useEconomy(useShallow((s) => s.stats));
