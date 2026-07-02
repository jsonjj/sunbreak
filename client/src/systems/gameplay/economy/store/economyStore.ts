// The client economy store — SP source of truth. Zustand + persist(localStorage). Every
// mutation delegates to the pure functions in ../rules so the (v4) server can re-run the
// exact same logic. Persistence is debounced by zustand and partialized to save-only fields.
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { CharacterId } from "@sunbreak/shared";
import {
  INCOME_TICK_MS,
  LAUNDER_HAIRCUT,
  SAVE_VERSION,
  STARTING_BANK,
  STARTING_CLEAN,
  STARTING_CREW,
  STARTING_DIRTY,
  STORAGE_KEY,
} from "../constants";
import {
  getCatalogItem,
  incomePerMinFor,
  launderCapacityFor,
} from "../catalog";
import {
  addXp,
  applyPurchase,
  computePerks,
  credit,
  debit,
  initSkills,
  initWallet,
  launder,
  meetsRequirement,
  moveBank,
  priceOf,
  wholeMinutes,
} from "../rules";
import type {
  AddMoneyOpts,
  BuyOpts,
  EconomySave,
  EconomyStats,
  OwnedAsset,
  PayoutOpts,
  PerkState,
  Result,
  SkillId,
  Skills,
  SpendOpts,
  Wallet,
} from "../types";

const round = (n: number) => Math.max(0, Math.round(n));

const initWallets = (): Record<CharacterId, Wallet> => ({
  [CharacterId.Cami]: initWallet(STARTING_CLEAN, STARTING_DIRTY, STARTING_BANK),
  [CharacterId.Mac]: initWallet(STARTING_CLEAN, STARTING_DIRTY, STARTING_BANK),
});

const initStats = (): EconomyStats => ({ earned: 0, spent: 0 });

interface EconomyData {
  active: CharacterId;
  wallets: Record<CharacterId, Wallet>;
  /** Shared crew stash (clean). */
  crew: number;
  skills: Skills;
  /** Unique owned items (weapons / vehicles / clothing). */
  inventory: string[];
  /** Durable owned assets (businesses / properties). */
  owned: OwnedAsset[];
  stats: EconomyStats;
  lastIncomeAt: number;
}

export interface EconomyState extends EconomyData {
  // ── money API ───────────────────────────────────────────────────────────────
  /** Credit money (clean on-hand by default; `dirty`/`toBank`/`char` via opts). */
  addMoney(amount: number, opts?: AddMoneyOpts): void;
  /** Debit clean cash (then bank if allowed). Returns false if unaffordable — never partial. */
  spend(price: number, opts?: SpendOpts): boolean;
  /** Mission/activity payout to a specific character (supports dirty scores). */
  grantPayout(charId: CharacterId, amount: number, opts?: PayoutOpts): void;
  /** Move clean cash into the shared crew stash (or negative to pull out). */
  contributeCrew(amount: number, char?: CharacterId): boolean;

  // ── shops ─────────────────────────────────────────────────────────────────────
  /** Validate + buy a catalog item; adds to inventory or owned assets. */
  buyItem(itemId: string, opts?: BuyOpts): Result<{ itemId: string }>;
  ownsAsset(id: string): boolean;

  // ── progression ────────────────────────────────────────────────────────────────
  grantXp(skill: SkillId, amount: number): void;
  getPerks(): PerkState;

  // ── laundering / banking ─────────────────────────────────────────────────────────
  launderDirty(amount: number, char?: CharacterId): boolean;
  bankDeposit(amount: number, char?: CharacterId): boolean;
  bankWithdraw(amount: number, char?: CharacterId): boolean;

  // ── lifecycle ──────────────────────────────────────────────────────────────────
  switchActiveChar(char: CharacterId): void;
  /** Accrue passive income from owned businesses using wall-clock deltas. */
  accrue(nowMs?: number): void;
  serializeSave(): EconomySave;
  loadSave(save: Partial<EconomySave>): void;
  resetEconomy(): void;
}

export const useEconomy = create<EconomyState>()(
  persist(
    (set, get) => ({
      active: CharacterId.Cami,
      wallets: initWallets(),
      crew: STARTING_CREW,
      skills: initSkills(),
      inventory: [],
      owned: [],
      stats: initStats(),
      lastIncomeAt: Date.now(),

      addMoney: (amount, opts = {}) =>
        set((s) => {
          const char = opts.char ?? s.active;
          const next = credit(s.wallets[char], amount, {
            dirty: opts.dirty,
            toBank: opts.toBank,
          });
          return {
            wallets: { ...s.wallets, [char]: next },
            stats: { ...s.stats, earned: s.stats.earned + round(amount) },
          };
        }),

      spend: (price, opts = {}) => {
        let ok = false;
        set((s) => {
          const char = opts.char ?? s.active;
          const r = debit(s.wallets[char], price, opts.allowBank ?? false);
          if (!r.ok) return {};
          ok = true;
          return {
            wallets: { ...s.wallets, [char]: r.value },
            stats: { ...s.stats, spent: s.stats.spent + round(price) },
          };
        });
        return ok;
      },

      grantPayout: (charId, amount, opts = {}) =>
        set((s) => {
          const next = credit(s.wallets[charId], amount, { dirty: opts.dirty });
          return {
            wallets: { ...s.wallets, [charId]: next },
            stats: { ...s.stats, earned: s.stats.earned + round(amount) },
          };
        }),

      contributeCrew: (amount, char) => {
        let ok = false;
        set((s) => {
          const c = char ?? s.active;
          const a = Math.round(amount);
          if (a > 0) {
            const r = debit(s.wallets[c], a, false);
            if (!r.ok) return {};
            ok = true;
            return { wallets: { ...s.wallets, [c]: r.value }, crew: s.crew + a };
          }
          const pull = Math.min(s.crew, -a);
          if (pull <= 0) return {};
          ok = true;
          return {
            crew: s.crew - pull,
            wallets: { ...s.wallets, [c]: credit(s.wallets[c], pull) },
          };
        });
        return ok;
      },

      buyItem: (itemId, opts = {}) => {
        let result: Result<{ itemId: string }> = { ok: false, reason: "unknown_item" };
        set((s) => {
          const item = getCatalogItem(itemId);
          if (!item) {
            result = { ok: false, reason: "unknown_item" };
            return {};
          }
          if (s.inventory.includes(itemId) || s.owned.some((a) => a.id === itemId)) {
            result = { ok: false, reason: "already_owned" };
            return {};
          }
          if (!meetsRequirement(s.skills, item)) {
            result = { ok: false, reason: "locked" };
            return {};
          }
          const char = opts.char ?? s.active;
          const pay = applyPurchase(
            s.wallets[char],
            item,
            opts.discount ?? 0,
            opts.allowBank ?? false,
          );
          if (!pay.ok) {
            result = { ok: false, reason: pay.reason };
            return {};
          }
          result = { ok: true, value: { itemId } };
          const spent = priceOf(item, opts.discount ?? 0);
          const wallets = { ...s.wallets, [char]: pay.value };
          const stats = { ...s.stats, spent: s.stats.spent + spent };
          if (item.shop === "business") {
            const asset: OwnedAsset = { id: itemId, kind: item.shop, acquiredAt: Date.now() };
            return { wallets, stats, owned: [...s.owned, asset] };
          }
          return { wallets, stats, inventory: [...s.inventory, itemId] };
        });
        return result;
      },

      ownsAsset: (id) => {
        const s = get();
        return s.inventory.includes(id) || s.owned.some((a) => a.id === id);
      },

      grantXp: (skill, amount) => set((s) => ({ skills: addXp(s.skills, skill, amount) })),

      getPerks: () => computePerks(get().skills),

      launderDirty: (amount, char) => {
        let ok = false;
        set((s) => {
          const c = char ?? s.active;
          const w = s.wallets[c];
          const capacity = launderCapacityFor(s.owned.map((a) => a.id));
          const r = launder(w.cash, amount, LAUNDER_HAIRCUT, capacity);
          if (!r.ok) return {};
          ok = true;
          return { wallets: { ...s.wallets, [c]: { ...w, cash: r.value } } };
        });
        return ok;
      },

      bankDeposit: (amount, char) => {
        let ok = false;
        set((s) => {
          const c = char ?? s.active;
          const r = moveBank(s.wallets[c], Math.abs(Math.round(amount)));
          if (!r.ok) return {};
          ok = true;
          return { wallets: { ...s.wallets, [c]: r.value } };
        });
        return ok;
      },

      bankWithdraw: (amount, char) => {
        let ok = false;
        set((s) => {
          const c = char ?? s.active;
          const r = moveBank(s.wallets[c], -Math.abs(Math.round(amount)));
          if (!r.ok) return {};
          ok = true;
          return { wallets: { ...s.wallets, [c]: r.value } };
        });
        return ok;
      },

      switchActiveChar: (char) => set({ active: char }),

      accrue: (nowMs = Date.now()) =>
        set((s) => {
          const minutes = wholeMinutes(nowMs - s.lastIncomeAt);
          if (minutes <= 0) return {};
          const advanced = s.lastIncomeAt + minutes * INCOME_TICK_MS;
          const gained = incomePerMinFor(s.owned.map((a) => a.id)) * minutes;
          if (gained <= 0) return { lastIncomeAt: advanced };
          const w = s.wallets[s.active];
          return {
            lastIncomeAt: advanced,
            wallets: { ...s.wallets, [s.active]: { ...w, bank: w.bank + gained } },
            stats: { ...s.stats, earned: s.stats.earned + gained },
          };
        }),

      serializeSave: () => {
        const s = get();
        return {
          version: SAVE_VERSION,
          active: s.active,
          wallets: s.wallets,
          crew: s.crew,
          skills: s.skills,
          inventory: s.inventory,
          owned: s.owned,
          stats: s.stats,
          lastIncomeAt: s.lastIncomeAt,
        };
      },

      loadSave: (save) =>
        set((s) => ({
          active: save.active ?? s.active,
          wallets: save.wallets ?? s.wallets,
          crew: save.crew ?? s.crew,
          skills: save.skills ?? s.skills,
          inventory: save.inventory ?? s.inventory,
          owned: save.owned ?? s.owned,
          stats: save.stats ?? s.stats,
          lastIncomeAt: save.lastIncomeAt ?? s.lastIncomeAt,
        })),

      resetEconomy: () =>
        set({
          active: CharacterId.Cami,
          wallets: initWallets(),
          crew: STARTING_CREW,
          skills: initSkills(),
          inventory: [],
          owned: [],
          stats: initStats(),
          lastIncomeAt: Date.now(),
        }),
    }),
    {
      name: STORAGE_KEY,
      version: SAVE_VERSION,
      storage: createJSONStorage<EconomyData>(() => localStorage),
      // Persist ONLY save-relevant data — never the action closures.
      partialize: (s): EconomyData => ({
        active: s.active,
        wallets: s.wallets,
        crew: s.crew,
        skills: s.skills,
        inventory: s.inventory,
        owned: s.owned,
        stats: s.stats,
        lastIncomeAt: s.lastIncomeAt,
      }),
      // v1 baseline. Future shape changes branch on `version` here.
      migrate: (persisted) => persisted as EconomyData,
    },
  ),
);
