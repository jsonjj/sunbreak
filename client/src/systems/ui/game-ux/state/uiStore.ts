// The game-ux Zustand store: the exclusive full-screen FSM plus the non-exclusive overlay
// layers (toasts, mission cards, phone, shop) and the cinematic flag other subsystems read.
//
// Kept intentionally separate from the v0 central `useUiStore` (client/src/stores/ui.store.ts),
// whose Toast/phone shapes are minimal and live in `shared`, which this wave can't edit. This
// store is the richer game-ux surface; the integrator can bridge the two if desired.
import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import type { ToastKind, UxRewards } from "./bus";

/** Exclusive full-screen state. Only one is active; layers float above whatever screen shows. */
export type GameScreen = "boot" | "loading" | "playing" | "wasted" | "booked" | "paused";

/** Post-processing/HUD read this to desaturate + vignette + slow time on death/arrest. */
export interface Cinematic {
  desaturate: number; // 0..1
  vignette: number; // 0..1
  timescale: number; // 1 = normal, <1 = slow-mo
}

export interface UxToast {
  id: string;
  kind: ToastKind;
  text: string;
  sub?: string;
  icon?: string;
  ttl: number; // ms; 0 = sticky
  priority: number; // higher sorts to top / survives the cap
  createdAt: number;
}

export interface MissionStartData {
  id: string;
  title: string;
  giver: string;
  objective: string;
}

export interface MissionResultData {
  id: string;
  pass: boolean;
  title?: string;
  rewards?: UxRewards;
  reason?: string;
  medal?: string;
}

export interface StateScreenData {
  variant: "wasted" | "booked";
  word: string; // FLATLINE / BOOKED
  subtitle: string;
  fee?: number;
  cause?: string;
  prompt?: string;
}

/** Max concurrent toasts (spec: ~4). Lowest-priority/oldest are dropped past this. */
export const TOAST_CAP = 4;

let toastSeq = 0;
const nextId = (): string => `ux-toast-${++toastSeq}-${Date.now().toString(36)}`;

export interface UxState {
  // --- exclusive screen FSM ---
  screen: GameScreen;
  state: StateScreenData | null; // data for wasted/booked shell
  cinematic: Cinematic | null;

  // --- loading ---
  loadingLabel: string | null; // scripted transition label (null = boot/asset loading)
  scriptedLoading: boolean; // true while a loading:begin/end pair is active

  // --- non-exclusive layers ---
  toasts: UxToast[];
  missionStart: MissionStartData | null;
  missionResult: MissionResultData | null;
  objective: string | null;
  phone: { open: boolean; app: string | null };
  shop: { open: boolean; vendorId: string | null };

  // --- actions ---
  setScreen: (screen: GameScreen) => void;
  setCinematic: (c: Cinematic | null) => void;

  beginLoading: (label?: string) => void;
  endLoading: () => void;

  pushToast: (t: {
    kind: ToastKind;
    text: string;
    sub?: string;
    icon?: string;
    ttl?: number;
    priority?: number;
    id?: string;
  }) => string;
  dismissToast: (id: string) => void;
  clearToasts: () => void;

  showMissionStart: (m: MissionStartData) => void;
  clearMissionStart: () => void;
  showMissionResult: (m: MissionResultData) => void;
  clearMissionResult: () => void;
  setObjective: (text: string | null) => void;

  showState: (s: StateScreenData) => void;
  clearState: () => void;

  openPhone: (app?: string) => void;
  closePhone: () => void;
  togglePhone: () => void;
  setPhoneApp: (app: string | null) => void;

  openShop: (vendorId: string) => void;
  closeShop: () => void;
}

/** Timers for auto-dismiss, kept outside React so re-renders never reset them. */
const toastTimers = new Map<string, ReturnType<typeof setTimeout>>();

function clearTimer(id: string): void {
  const t = toastTimers.get(id);
  if (t) {
    clearTimeout(t);
    toastTimers.delete(id);
  }
}

export const useUxStore = create<UxState>()(
  subscribeWithSelector((set, get) => ({
    screen: "playing",
    state: null,
    cinematic: null,

    loadingLabel: null,
    scriptedLoading: false,

    toasts: [],
    missionStart: null,
    missionResult: null,
    objective: null,
    phone: { open: false, app: null },
    shop: { open: false, vendorId: null },

    setScreen: (screen) => set({ screen }),
    setCinematic: (cinematic) => set({ cinematic }),

    beginLoading: (label) =>
      set({ scriptedLoading: true, loadingLabel: label ?? null, screen: "loading" }),
    endLoading: () =>
      set((s) => ({
        scriptedLoading: false,
        loadingLabel: null,
        // Only leave the loading screen if we entered it for a scripted transition.
        screen: s.screen === "loading" ? "playing" : s.screen,
      })),

    pushToast: (t) => {
      const id = t.id ?? nextId();
      const toast: UxToast = {
        id,
        kind: t.kind,
        text: t.text,
        sub: t.sub,
        icon: t.icon,
        ttl: t.ttl ?? 4200,
        priority: t.priority ?? 0,
        createdAt: Date.now(),
      };
      set((s) => {
        const next = [...s.toasts.filter((x) => x.id !== id), toast];
        // Enforce the cap: drop the lowest priority, then oldest.
        next.sort((a, b) => a.priority - b.priority || a.createdAt - b.createdAt);
        while (next.length > TOAST_CAP) {
          const dropped = next.shift();
          if (dropped) clearTimer(dropped.id);
        }
        // Restore newest-first display order.
        next.sort((a, b) => b.createdAt - a.createdAt);
        return { toasts: next };
      });
      if (toast.ttl > 0) {
        clearTimer(id);
        toastTimers.set(
          id,
          setTimeout(() => get().dismissToast(id), toast.ttl),
        );
      }
      return id;
    },
    dismissToast: (id) => {
      clearTimer(id);
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    },
    clearToasts: () => {
      for (const id of toastTimers.keys()) clearTimer(id);
      set({ toasts: [] });
    },

    showMissionStart: (missionStart) => set({ missionStart }),
    clearMissionStart: () => set({ missionStart: null }),
    showMissionResult: (missionResult) => set({ missionResult }),
    clearMissionResult: () => set({ missionResult: null }),
    setObjective: (objective) => set({ objective }),

    showState: (state) =>
      set({ state, screen: state.variant === "booked" ? "booked" : "wasted" }),
    clearState: () => set({ state: null, cinematic: null, screen: "playing" }),

    openPhone: (app) => set((s) => ({ phone: { open: true, app: app ?? s.phone.app } })),
    closePhone: () => set((s) => ({ phone: { ...s.phone, open: false } })),
    togglePhone: () => set((s) => ({ phone: { ...s.phone, open: !s.phone.open } })),
    setPhoneApp: (app) => set((s) => ({ phone: { ...s.phone, app } })),

    openShop: (vendorId) => set({ shop: { open: true, vendorId } }),
    closeShop: () => set((s) => ({ shop: { ...s.shop, open: false } })),
  })),
);
