// OPT-IN convenience key bindings. NOT auto-installed (to avoid clashing with the Input
// subsystem's own bindings). The integrator may call this once, or instead route the real input
// map to the exported store actions / events. Returns an unbind fn.
import { useUxStore } from "./uiStore";
import { gameEvents } from "./bus";

export interface KeyBindingOptions {
  /** toggle the phone (default "p"). */
  phone?: string;
  /** open the seed shop for quick testing (default: unset). */
  shopVendorId?: string;
  shopKey?: string;
}

export function bindDefaultKeys(opts: KeyBindingOptions = {}): () => void {
  const phoneKey = (opts.phone ?? "p").toLowerCase();
  const shopKey = opts.shopKey?.toLowerCase();

  const onKey = (e: KeyboardEvent) => {
    if (e.repeat) return;
    const k = e.key.toLowerCase();
    if (k === phoneKey) useUxStore.getState().togglePhone();
    else if (shopKey && k === shopKey && opts.shopVendorId)
      gameEvents.emit("shop:open", { vendorId: opts.shopVendorId });
  };

  window.addEventListener("keydown", onKey);
  return () => window.removeEventListener("keydown", onKey);
}
