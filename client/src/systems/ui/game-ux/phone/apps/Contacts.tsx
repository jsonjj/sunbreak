// Contacts roster. Tapping an unlocked contact opens their Messages thread. Locked contacts
// (story/character-gated per canon) render dimmed with a lock note.
import { PERSONAS } from "../personas";
import { Avatar } from "../Avatar";
import { Icon } from "../../kit/Icon";
import s from "../phone.module.css";

export function Contacts({ onOpen }: { onOpen: (npcId: string) => void }) {
  return (
    <ul className={s.contactList}>
      {PERSONAS.map((p) => (
        <li key={p.id}>
          <button
            className={s.contactRow}
            onClick={() => !p.locked && onOpen(p.id)}
            disabled={p.locked}
            aria-label={`Message ${p.name}`}
          >
            <Avatar persona={p} />
            <span className={s.contactMeta}>
              <span className={s.contactName}>{p.name}</span>
              <span className={s.contactRole}>{p.locked ? "Locked · unlock via story" : p.blurb}</span>
            </span>
            <span className={s.contactCta}>
              <Icon name={p.locked ? "shield" : "message"} size={16} />
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
