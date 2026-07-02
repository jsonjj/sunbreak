// Small key-glyph chips. A CC0 icon atlas (Kenney/Xelu) can swap in behind this later.
import { t } from "../i18n/en";

/** A row of key chips; renders a graceful "unbound" label when empty. */
export function Glyphs({ glyphs, done }: { glyphs: string[]; done?: boolean }) {
  if (glyphs.length === 0) return <span className="onb-row__unbound">{t("onb.help.unbound")}</span>;
  return (
    <>
      {glyphs.map((g, i) => (
        <kbd key={`${g}-${i}`} className="onb-chip" data-done={done ? "true" : "false"}>
          {g}
        </kbd>
      ))}
    </>
  );
}
