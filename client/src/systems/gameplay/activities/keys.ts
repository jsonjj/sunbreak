// Minimal keyboard edge tracker for the LOCAL interaction fallback (interact / cancel). Kept
// self-contained so we don't couple to the Input subsystem; when Interaction lands and drives
// triggering, this is unused. Keydown fires during pointer-lock, so it works in-game.

export interface KeyEdges {
  /** True once per physical press of `key` (case-insensitive), then consumed. */
  consume(key: string): boolean;
  /** Clear any unconsumed just-pressed keys. Call at end of each tick. */
  endFrame(): void;
  dispose(): void;
}

export function createKeyEdges(): KeyEdges {
  const down = new Set<string>();
  const justPressed = new Set<string>();

  const onDown = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if (!down.has(k)) justPressed.add(k);
    down.add(k);
  };
  const onUp = (e: KeyboardEvent) => {
    down.delete(e.key.toLowerCase());
  };

  window.addEventListener("keydown", onDown);
  window.addEventListener("keyup", onUp);

  return {
    consume(key) {
      const k = key.toLowerCase();
      if (justPressed.has(k)) {
        justPressed.delete(k);
        return true;
      }
      return false;
    },
    endFrame() {
      justPressed.clear();
    },
    dispose() {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    },
  };
}
