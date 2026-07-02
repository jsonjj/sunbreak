// ─────────────────────────────────────────────────────────────────────────────
// useDynamicContent — React access to loaded content (read from pools by default)
// ─────────────────────────────────────────────────────────────────────────────
// These hooks read from the in-memory pools (instant, offline). Runtime generation
// is opt-in and lives in ./content-client; UI should prefer pack content and only
// trigger generation to background-refill, never to block a render.

import { useEffect, useState } from "react";
import type { District, MissionType, Station } from "./canon";
import type { Bark, Mission, RadioAd, SideQuest } from "./contract/schemas";
import { useContentStore, type BarkContext } from "./contentStore";

export interface ContentStatusView {
  ready: boolean;
  source: string;
  counts: { barks: number; radioAds: number; missions: number; sidequests: number };
  activeBarks: number;
  runtimeEnabled: boolean;
  hasKey: boolean;
}

/** Loaded-content summary for HUD/debug surfaces. */
export function useContentStatus(): ContentStatusView {
  const ready = useContentStore((s) => s.ready);
  const source = useContentStore((s) => s.source);
  const counts = useContentStore((s) => s.counts);
  const activeBarks = useContentStore((s) => s.activeBarks);
  const status = useContentStore((s) => s.status);
  return {
    ready,
    source,
    counts,
    activeBarks,
    runtimeEnabled: status?.runtimeEnabled ?? false,
    hasKey: status?.hasKey ?? false,
  };
}

/** Stable `getBark(ctx?)` — pulls instantly from the pool (round-robin + dedupe). */
export function useBarkPicker(): (ctx?: Partial<BarkContext>) => Bark | null {
  return useContentStore((s) => s.getBark);
}

/** Stable `getRadioAd(station)` for the radio subsystem's ad-slot scheduler. */
export function useRadioAdPicker(): (station: Station) => RadioAd | null {
  return useContentStore((s) => s.getRadioAd);
}

/** Stable `getMission(params?)` for the mission runner. */
export function useMissionPicker(): (
  params?: { district?: District; type?: MissionType },
) => Mission | null {
  return useContentStore((s) => s.getMission);
}

/** Stable `getSideQuest(params?)`. */
export function useSideQuestPicker(): (params?: { district?: District }) => SideQuest | null {
  return useContentStore((s) => s.getSideQuest);
}

/** Feed world context (district/weather/time/wanted) into the bark director. */
export function useBarkContextControls(): (ctx: Partial<BarkContext>) => void {
  return useContentStore((s) => s.setBarkContext);
}

/** Convenience: a bark that rotates on an interval (handy for previews/demos). */
export function useRandomBark(ctx?: Partial<BarkContext>, intervalMs = 3500): Bark | null {
  const getBark = useContentStore((s) => s.getBark);
  const ready = useContentStore((s) => s.ready);
  const [bark, setBark] = useState<Bark | null>(null);
  const ctxKey = JSON.stringify(ctx ?? {});

  useEffect(() => {
    if (!ready) return;
    const parsed = JSON.parse(ctxKey) as Partial<BarkContext>;
    const tick = () => setBark(getBark(parsed));
    tick();
    const id = setInterval(tick, Math.max(500, intervalMs));
    return () => clearInterval(id);
  }, [getBark, ready, intervalMs, ctxKey]);

  return bark;
}
