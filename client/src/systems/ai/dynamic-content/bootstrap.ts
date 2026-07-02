// ─────────────────────────────────────────────────────────────────────────────
// bootstrap — one-time content load (runs from the module's init())
// ─────────────────────────────────────────────────────────────────────────────
// Order matters and is designed so the game ALWAYS has content immediately:
//   1. Load bundled authored packs synchronously  -> instant, offline, $0.
//   2. Merge last session's persisted bundle (cache) if present.
//   3. In the background, ask the server for its authored+generated packs and its
//      runtime status; merge + persist on success. Any failure is a no-op.

import { authoredContent } from "./packs";
import { readBundle, writeBundle } from "./cache";
import { fetchContentPacks, fetchStatus } from "./content-client";
import { useContentStore } from "./contentStore";

export function bootstrap(): () => void {
  const store = useContentStore.getState();

  // 1. Instant bundled fallback — the world has content no matter what.
  store.setContent(authoredContent, "bundled");

  // 2. Warm from last session's persisted (merged) bundle, if any.
  const cached = readBundle();
  if (cached) store.mergeContent(cached, "cache");

  // 3. Best-effort server refresh (packs + runtime status).
  const ctl = new AbortController();
  let disposed = false;

  void (async () => {
    const [status, packs] = await Promise.all([
      fetchStatus(ctl.signal),
      fetchContentPacks(ctl.signal),
    ]);
    if (disposed) return;
    if (status) useContentStore.getState().setStatus(status);
    if (packs) {
      useContentStore.getState().mergeContent(packs, "server");
      const s = useContentStore.getState();
      writeBundle({
        barks: s.barks,
        radioAds: s.radioAds,
        missions: s.missions,
        sidequests: s.sidequests,
      });
    }
  })();

  return () => {
    disposed = true;
    ctl.abort();
  };
}
