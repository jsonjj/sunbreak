// Public, framework-free money/shop/progression API. This is the ONLY surface other
// subsystems (missions, activities, combat, vehicles, world) should touch — no direct store
// or field pokes. Import it as:  import { economyApi } from "@/systems/gameplay/economy";
import type { CharacterId, Vec3 } from "@sunbreak/shared";
import { world } from "@/ecs/world";
import { useEconomy } from "./store/economyStore";
import { netWorth, onHand } from "./rules";
import { getCatalogItem } from "./catalog";
import type {
  AddMoneyOpts,
  BuyOpts,
  CatalogItem,
  EconomySave,
  PayoutOpts,
  PerkState,
  Result,
  SkillId,
  SpendOpts,
  Wallet,
} from "./types";

const state = () => useEconomy.getState();

export const economyApi = {
  // ── money ──────────────────────────────────────────────────────────────────
  /** Credit money to a character (clean on-hand by default). */
  addMoney(amount: number, opts?: AddMoneyOpts): void {
    state().addMoney(amount, opts);
  },
  /** Spend clean cash (then bank if `allowBank`). Returns false if unaffordable. */
  spend(price: number, opts?: SpendOpts): boolean {
    return state().spend(price, opts);
  },
  /** Mission/activity payout (supports dirty scores via `opts.dirty`). */
  grantPayout(charId: CharacterId, amount: number, opts?: PayoutOpts): void {
    state().grantPayout(charId, amount, opts);
  },
  /** True if the character can afford `price` right now. */
  canAfford(price: number, opts?: { allowBank?: boolean; char?: CharacterId }): boolean {
    const s = state();
    const w = s.wallets[opts?.char ?? s.active];
    return w.cash.clean + (opts?.allowBank ? w.bank : 0) >= Math.max(0, Math.round(price));
  },
  /** Read a character's wallet (immutable snapshot). */
  getWallet(char?: CharacterId): Wallet {
    const s = state();
    return s.wallets[char ?? s.active];
  },
  /** Convenience totals. */
  getBalance(char?: CharacterId): { cash: number; bank: number; dirty: number; net: number } {
    const s = state();
    const w = s.wallets[char ?? s.active];
    return { cash: w.cash.clean, bank: w.bank, dirty: w.cash.dirty, net: netWorth(w) };
  },
  /** Total cash on hand (clean + dirty). */
  cashOnHand(char?: CharacterId): number {
    const s = state();
    return onHand(s.wallets[char ?? s.active].cash);
  },

  // ── shops ─────────────────────────────────────────────────────────────────────
  /** Buy a catalog item by id. */
  buyItem(itemId: string, opts?: BuyOpts): Result<{ itemId: string }> {
    return state().buyItem(itemId, opts);
  },
  /** Look up a catalog item. */
  getItem(itemId: string): CatalogItem | undefined {
    return getCatalogItem(itemId);
  },
  /** Does the player own this item/asset? */
  ownsAsset(id: string): boolean {
    return state().ownsAsset(id);
  },

  // ── progression ──────────────────────────────────────────────────────────────
  /** Grant XP to a skill (throttle at the call site for per-frame events). */
  grantXp(skill: SkillId, amount: number): void {
    state().grantXp(skill, amount);
  },
  /** Read-only perk snapshot other systems poll. */
  getPerks(): PerkState {
    return state().getPerks();
  },
  hasPerk(perkId: string): boolean {
    return state().getPerks().perks.includes(perkId);
  },

  // ── laundering / banking ───────────────────────────────────────────────────────
  launder(amount: number, char?: CharacterId): boolean {
    return state().launderDirty(amount, char);
  },
  deposit(amount: number, char?: CharacterId): boolean {
    return state().bankDeposit(amount, char);
  },
  withdraw(amount: number, char?: CharacterId): boolean {
    return state().bankWithdraw(amount, char);
  },

  // ── world money drops (ECS) ─────────────────────────────────────────────────────
  /** Spawn a collectible cash pickup at a world position; `pickupSystem` credits it on contact. */
  dropCash(position: Vec3, amount: number, dirty = false): void {
    world.add({
      econ_pickup: { amount: Math.max(1, Math.round(amount)), dirty },
      transform: { position: { ...position }, rotation: { x: 0, y: 0, z: 0, w: 1 } },
    });
  },

  // ── character + save ─────────────────────────────────────────────────────────────
  switchActiveChar(char: CharacterId): void {
    state().switchActiveChar(char);
  },
  activeChar(): CharacterId {
    return state().active;
  },
  /** Snapshot for the Save subsystem. */
  serializeSave(): EconomySave {
    return state().serializeSave();
  },
  /** Load a save envelope (e.g. from server SQLite). */
  loadSave(save: Partial<EconomySave>): void {
    state().loadSave(save);
  },
};

export type EconomyApi = typeof economyApi;
