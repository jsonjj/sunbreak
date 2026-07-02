/** Tiny classnames composer (kept local — no extra dependency). */
export type ClassValue = string | number | false | null | undefined;

export function cx(...parts: ClassValue[]): string {
  let out = "";
  for (const p of parts) {
    if (!p) continue;
    out += (out ? " " : "") + p;
  }
  return out;
}

/** Guarded classList toggle — no-ops on null elements / undefined (empty) class tokens. */
export function toggleClass(el: Element | null | undefined, cls: string | undefined, on: boolean): void {
  if (el && cls) el.classList.toggle(cls, on);
}
