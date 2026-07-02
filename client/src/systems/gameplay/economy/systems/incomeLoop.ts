// Passive-income driver — deliberately OFF the frame loop. Runs once at boot (offline
// catch-up) then on a wall-clock interval. Accrual math itself uses timestamp deltas, so a
// missed tick (backgrounded tab) is reconciled on the next call. Returns a cleanup fn.
import { INCOME_TICK_MS } from "../constants";
import { useEconomy } from "../store/economyStore";

export function startIncomeLoop(): () => void {
  // Reconcile any income earned while the game was closed.
  useEconomy.getState().accrue(Date.now());

  const handle = setInterval(() => {
    useEconomy.getState().accrue(Date.now());
  }, INCOME_TICK_MS);

  return () => clearInterval(handle);
}
