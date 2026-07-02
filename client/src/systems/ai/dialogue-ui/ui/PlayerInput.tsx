// Optional free-text field (input mode, or when the global free-text setting is on).
// Focus is trapped by the overlay so WASD never leaks to the player. Enter sends,
// Esc cancels/leaves. Length is capped + zod-validated before submit.

import { useEffect, useMemo, useRef, useState } from "react";
import { MAX_PLAYER_CHARS } from "../constants";
import { makePlayerTextSchema } from "../contract";
import styles from "./dialogue.module.css";

interface Props {
  onSend: (text: string) => void;
  onCancel: () => void;
  busy?: boolean;
  autoFocus?: boolean;
}

export function PlayerInput({ onSend, onCancel, busy = false, autoFocus = false }: Props) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const schema = useMemo(() => makePlayerTextSchema(MAX_PLAYER_CHARS), []);
  const valid = schema.safeParse(value).success;

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const submit = (): void => {
    if (!valid || busy) return;
    onSend(value);
    setValue("");
  };

  return (
    <div className={styles.inputWrap}>
      <div className={styles.inputRow}>
        <input
          ref={inputRef}
          className={styles.textInput}
          type="text"
          value={value}
          maxLength={MAX_PLAYER_CHARS}
          placeholder="Say something…"
          autoComplete="off"
          spellCheck={false}
          disabled={busy}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              onCancel();
            }
          }}
        />
        <button
          type="button"
          className={styles.sendBtn}
          onClick={submit}
          disabled={!valid || busy}
          aria-label="Send message"
        >
          Send
        </button>
      </div>
      <div className={styles.counter}>
        {value.length}/{MAX_PLAYER_CHARS}
      </div>
    </div>
  );
}
