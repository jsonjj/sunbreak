// The exported conversation overlay — a DOM sibling of <Canvas> (NOT in-scene geometry).
// The integrator mounts <DialogueOverlay/> once, alongside <RenderCanvas/> and <HUD/>.
// It renders nothing heavy when idle (just ambient subtitles + the "Press E" prompt),
// and a status-driven bottom panel while a conversation is open.
//
// Keyboard containment: because this lives inside the React root, calling
// `e.stopPropagation()` here also stops the NATIVE event at the root, so the game's
// InputManager (a window listener) never sees keys typed into the overlay. A focus-trap
// keeps focus inside while open so nothing leaks even if the player clicks away.

import { useEffect, useRef } from "react";
import { useDialogueStore } from "../store";
import { OVERLAY_Z_INDEX, VISIBLE_HISTORY_LINES } from "../constants";
import { TypingIndicator } from "./TypingIndicator";
import { ChoiceList } from "./ChoiceList";
import { PlayerInput } from "./PlayerInput";
import { Subtitles } from "./Subtitles";
import { NearbyPrompt } from "./NearbyPrompt";
import styles from "./dialogue.module.css";

export function DialogueOverlay() {
  const status = useDialogueStore((s) => s.status);
  const speaker = useDialogueStore((s) => s.speaker);
  const streamText = useDialogueStore((s) => s.streamText);
  const choices = useDialogueStore((s) => s.choices);
  const mode = useDialogueStore((s) => s.mode);
  const history = useDialogueStore((s) => s.history);
  const error = useDialogueStore((s) => s.error);
  const nearby = useDialogueStore((s) => s.nearby);
  const freeTextEnabled = useDialogueStore((s) => s.freeTextEnabled);

  const pick = useDialogueStore((s) => s.pick);
  const sendText = useDialogueStore((s) => s.sendText);
  const close = useDialogueStore((s) => s.close);
  const skipReveal = useDialogueStore((s) => s.skipReveal);
  const setFreeTextEnabled = useDialogueStore((s) => s.setFreeTextEnabled);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const open = status !== "idle";

  // Focus-trap while open: keep keyboard focus inside so movement keys never reach
  // the InputManager, and Tab can't escape to the page behind the scrim.
  useEffect(() => {
    if (!open) return;
    const el = rootRef.current;
    el?.focus();
    const onFocusIn = (e: FocusEvent): void => {
      if (el && e.target instanceof Node && !el.contains(e.target)) el.focus();
    };
    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
  }, [open]);

  if (!open) {
    return (
      <>
        <Subtitles />
        {nearby ? <NearbyPrompt npc={nearby} /> : null}
      </>
    );
  }

  const revealing = status === "streaming" && !useDialogueStore.getState().isRevealComplete();
  const waitingFirst = status === "opening" || (status === "streaming" && streamText.length === 0);
  const canType = mode === "input" || freeTextEnabled;
  const showChoices =
    choices.length > 0 && (status === "awaiting_choice" || status === "awaiting_input");
  const showInput = canType && (status === "awaiting_input" || status === "awaiting_choice");

  // Show recent log ABOVE the live line; exclude the active (last, non-player) line so
  // it isn't duplicated by the body region.
  const last = history[history.length - 1];
  const base = last && !last.isPlayer ? history.slice(0, -1) : history;
  const recent = base.slice(-VISIBLE_HISTORY_LINES);

  return (
    <>
      <Subtitles />
      <div
        ref={rootRef}
        className={styles.scrim}
        style={{ zIndex: OVERLAY_Z_INDEX }}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={speaker ? `Conversation with ${speaker.displayName}` : "Conversation"}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Escape") {
            e.preventDefault();
            close("leave");
            return;
          }
          if (revealing && (e.key === " " || e.key === "Enter")) {
            e.preventDefault();
            skipReveal();
          }
        }}
        onKeyUp={(e) => e.stopPropagation()}
      >
        <div className={styles.panel}>
          {recent.length > 0 ? (
            <div className={styles.history} aria-hidden>
              {recent.map((l) => (
                <p
                  key={l.id}
                  className={`${styles.historyLine} ${l.isPlayer ? styles.historyPlayer : ""}`}
                >
                  <span className={styles.historyName} style={{ color: l.speaker.color }}>
                    {l.speaker.displayName}:
                  </span>{" "}
                  {l.text}
                </p>
              ))}
            </div>
          ) : null}

          <div className={styles.nameplate}>
            <span className={styles.name} style={{ color: speaker?.color }}>
              {speaker?.displayName ?? "…"}
            </span>
            {speaker?.emotion ? <span className={styles.emotion}>{speaker.emotion}</span> : null}
          </div>

          <div className={styles.body}>
            {waitingFirst ? (
              <TypingIndicator />
            ) : (
              <p className={styles.text}>
                {streamText}
                {revealing ? <span className={styles.caret} aria-hidden /> : null}
              </p>
            )}
            {error ? <p className={styles.error}>{error}</p> : null}
          </div>

          {showChoices ? <ChoiceList choices={choices} onPick={pick} /> : null}

          {showInput ? (
            <PlayerInput
              onSend={sendText}
              onCancel={() => close("leave")}
              autoFocus={mode === "input"}
            />
          ) : null}

          <div className={styles.footer}>
            <button
              type="button"
              className={styles.toggle}
              onClick={() => setFreeTextEnabled(!freeTextEnabled)}
              aria-pressed={freeTextEnabled}
              title="Free-text replies (choice-first by default for cost & safety)"
            >
              <span className={`${styles.toggleDot} ${freeTextEnabled ? styles.toggleOn : ""}`} />
              Free text
            </button>
            <span className={styles.hint}>
              <kbd>Esc</kbd> leave · <kbd>↑↓</kbd> choose · <kbd>Space</kbd> skip
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
