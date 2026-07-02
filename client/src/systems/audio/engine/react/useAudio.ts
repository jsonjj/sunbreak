// Public React hook for HUD/settings/gameplay UI. Returns the full audio API plus the currently
// reactive mixer values (so a settings slider re-renders with live volumes).
import { useMemo } from "react";
import { audio } from "../api";
import { useMixer } from "../mixer/mixerStore";
import type { Category } from "../mixer/categories";

export type UseAudio = typeof audio & {
  master: number;
  categories: Record<Category, number>;
  muted: Partial<Record<Category, boolean>>;
  solo: Category | null;
};

export function useAudio(): UseAudio {
  const master = useMixer((s) => s.master);
  const categories = useMixer((s) => s.categories);
  const muted = useMixer((s) => s.muted);
  const solo = useMixer((s) => s.solo);
  return useMemo(
    () => ({ ...audio, master, categories, muted, solo }),
    [master, categories, muted, solo],
  );
}
