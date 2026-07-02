// Single source of truth for whether the debug layer is live.
//
// Gating rules (mirrors v0's `client/src/util/debug.ts` but owned by this subsystem so we
// never edit v0):
//   - always on in a dev build (`import.meta.env.DEV`)
//   - on in any build (incl. production) when the URL carries `?debug`
//   - a persisted opt-in flag (localStorage) also flips it on, so a free-tier deploy can be
//     toggled into debug without a rebuild.
//
// Because every heavy panel is behind a dynamic `import()` that is only reached when this
// returns true, a normal production page (no `?debug`, no flag) never pulls `leva` / `r3f-perf`
// into the loaded bundle — they stay in a separate async chunk that is never fetched.

const LS_KEY = "sunbreak:debug";

function hasQueryFlag(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).has("debug");
}

function hasPersistedFlag(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(LS_KEY) === "1";
  } catch {
    return false;
  }
}

/** True when the dev tooling should be mounted/active for this session. Evaluated lazily so a
 *  runtime `enableDebug()` toggle takes effect on the next mount without a reload dependency. */
export function debugEnabled(): boolean {
  return import.meta.env.DEV || hasQueryFlag() || hasPersistedFlag();
}

/** Persist the opt-in flag so tools survive reloads on a production deploy. */
export function enableDebug(on = true): void {
  if (typeof window === "undefined") return;
  try {
    if (on) window.localStorage.setItem(LS_KEY, "1");
    else window.localStorage.removeItem(LS_KEY);
  } catch {
    /* ignore quota / privacy-mode errors */
  }
}
