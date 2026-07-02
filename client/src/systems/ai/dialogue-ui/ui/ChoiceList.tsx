// Keyboard/gamepad-navigable response list. ↑/↓ (or hover) move selection, Enter/click
// picks, 1–9 quick-pick. A "Leave" option is always present (appended by the store).
// Gamepad D-pad/A map to the same focus model via the browser's standard button focus.

import { useEffect, useRef, useState } from "react";
import type { DialogueChoice } from "../contract";
import { LEAVE_CHOICE_ID } from "../constants";
import styles from "./dialogue.module.css";

interface Props {
  choices: DialogueChoice[];
  onPick: (id: string) => void;
}

export function ChoiceList({ choices, onPick }: Props) {
  const [selected, setSelected] = useState(0);
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    setSelected(0);
  }, [choices]);

  useEffect(() => {
    refs.current[selected]?.focus();
  }, [selected, choices]);

  const move = (delta: number): void => {
    const n = choices.length;
    if (n === 0) return;
    setSelected((i) => (((i + delta) % n) + n) % n);
  };

  return (
    <div
      className={styles.choices}
      role="menu"
      aria-label="Responses"
      onKeyDown={(e) => {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          move(1);
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          move(-1);
        } else if (e.key === "Home") {
          e.preventDefault();
          setSelected(0);
        } else if (e.key === "End") {
          e.preventDefault();
          setSelected(choices.length - 1);
        } else if (/^[1-9]$/.test(e.key)) {
          const idx = Number(e.key) - 1;
          const c = choices[idx];
          if (c) {
            e.preventDefault();
            onPick(c.id);
          }
        }
      }}
    >
      {choices.map((c, i) => {
        const isLeave = c.endsConversation === true || c.id === LEAVE_CHOICE_ID;
        const cls = [styles.choice, isLeave ? styles.leave : "", i === selected ? styles.choiceActive : ""]
          .filter(Boolean)
          .join(" ");
        return (
          <button
            key={c.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="menuitem"
            className={cls}
            onClick={() => onPick(c.id)}
            onMouseEnter={() => setSelected(i)}
          >
            <span className={styles.choiceKey} aria-hidden>
              {i + 1}
            </span>
            <span className={styles.choiceBody}>
              <span className={styles.choiceLabel}>{c.label}</span>
              {c.hint ? <span className={styles.choiceHint}>{c.hint}</span> : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}
