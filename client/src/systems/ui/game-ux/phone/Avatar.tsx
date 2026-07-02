import type { Persona } from "./personas";
import s from "./phone.module.css";

export function Avatar({ persona, size = 40 }: { persona: Persona; size?: number }) {
  return (
    <span
      className={s.avatar}
      style={{ width: size, height: size, background: persona.color, fontSize: size * 0.36 }}
      aria-hidden
    >
      {persona.initials}
    </span>
  );
}
