/** True when the page URL has a `?debug` flag — enables physics wireframes + perf overlay. */
export const isDebug = (): boolean => {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).has("debug");
};
