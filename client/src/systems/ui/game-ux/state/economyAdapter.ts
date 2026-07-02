// Economy seam. The shop + wallet drive through this small contract so game-ux does not hard-
// depend on the (still-stub) `gameplay/economy` subsystem's internals. A working DEFAULT reads
// / writes the stable v0 central HUD store (cash -> clean, bank -> stash) so the shop and phone
// wallet function immediately. The integrator swaps in the real economy API via
// `setEconomyApi(...)` once `gameplay/economy` lands — no game-ux code changes required.
import { useHudStore } from "@/stores/hud.store";
import { gameEvents, type UxCurrency } from "./bus";

export interface Wallet {
  clean: number;
  dirty: number;
  stash: number;
}

export interface Grants {
  cash?: number; // clean
  dirty?: number;
  items?: string[];
}

export interface EconomyApi {
  getWallet(): Wallet;
  canAfford(amount: number, currency?: UxCurrency): boolean;
  /** Deduct; returns false (and mutates nothing) if unaffordable. */
  charge(amount: number, currency?: UxCurrency): boolean;
  grant(grants?: Grants): void;
  feeFor(kind: string): number;
  /** Subscribe to wallet changes; returns an unsubscribe fn. */
  subscribe(cb: (w: Wallet) => void): () => void;
}

const FEES: Record<string, number> = {
  hospital: 250,
  bribe: 500,
  respawn: 250,
};

function walletFromHud(): Wallet {
  const s = useHudStore.getState();
  return { clean: s.cash, dirty: 0, stash: s.bank };
}

/** Default implementation backed by the v0 HUD store. */
const defaultEconomy: EconomyApi = {
  getWallet: walletFromHud,

  canAfford: (amount, currency = "clean") => {
    const w = walletFromHud();
    return w[currency] >= amount;
  },

  charge: (amount, currency = "clean") => {
    const w = walletFromHud();
    if (w[currency] < amount) return false;
    const hud = useHudStore.getState();
    if (currency === "clean") hud.patch({ cash: Math.max(0, hud.cash - amount) });
    else if (currency === "stash") hud.patch({ bank: Math.max(0, hud.bank - amount) });
    // "dirty" has no v0 HUD field; the real economy API tracks it. No-op here.
    gameEvents.emit("economy:wallet", walletFromHud());
    return true;
  },

  grant: (grants) => {
    if (!grants) return;
    const hud = useHudStore.getState();
    if (grants.cash) hud.patch({ cash: hud.cash + grants.cash });
    gameEvents.emit("economy:wallet", walletFromHud());
  },

  feeFor: (kind) => FEES[kind] ?? 0,

  subscribe: (cb) =>
    useHudStore.subscribe((s) => cb({ clean: s.cash, dirty: 0, stash: s.bank })),
};

let current: EconomyApi = defaultEconomy;

/** Read the active economy API (default HUD-backed, or whatever the integrator installed). */
export function getEconomy(): EconomyApi {
  return current;
}

/** Integrator hook: replace the economy implementation (e.g. the real `gameplay/economy`). */
export function setEconomyApi(api: EconomyApi): void {
  current = api;
}
