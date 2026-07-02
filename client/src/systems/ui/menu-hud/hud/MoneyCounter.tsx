import { useEffect, useRef } from "react";
import { cx, toggleClass } from "../lib/cx";
import { formatMoney } from "../lib/format";
import { useHudStore } from "../lib/stores";
import styles from "../styles/hud.module.css";

/** Top-right cash readout. Discrete (selector) with a rAF count-up + flash on change. */
export function MoneyCounter() {
  const cash = useHudStore((s) => s.cash);
  const bank = useHudStore((s) => s.bank);
  const valueRef = useRef<HTMLDivElement>(null);
  const shown = useRef(cash);
  const raf = useRef(0);

  useEffect(() => {
    const from = shown.current;
    const to = cash;
    const el = valueRef.current;
    if (from === to) {
      if (el) el.textContent = formatMoney(to);
      return;
    }
    toggleClass(el, styles.flash, true);
    const start = performance.now();
    const dur = 420;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      const v = from + (to - from) * eased;
      shown.current = v;
      if (el) el.textContent = formatMoney(v);
      if (t < 1) {
        raf.current = requestAnimationFrame(tick);
      } else {
        shown.current = to;
        if (el) el.textContent = formatMoney(to);
        toggleClass(el, styles.flash, false);
      }
    };
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [cash]);

  return (
    <div className={cx(styles.panel, styles.money)} role="group" aria-label="Cash">
      <div ref={valueRef} className={styles.moneyValue}>
        {formatMoney(cash)}
      </div>
      {bank > 0 ? <div className={styles.moneyBank}>Bank {formatMoney(bank)}</div> : null}
    </div>
  );
}
