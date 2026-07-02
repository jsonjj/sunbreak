// Data-driven vendor storefront. Category tabs, list, detail pane, buy/sell with live
// affordability vs the wallet (economy seam). Buy: canAfford -> charge -> grant -> confirm toast,
// guarded against double-spend. Opened via `shop:open` event / openShop store action.
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { FocusScope } from "../kit/FocusScope";
import { Button } from "../kit/Button";
import { Icon } from "../kit/Icon";
import { Money, formatMoney } from "../kit/Money";
import { cx } from "../kit/cx";
import { gameEvents } from "../state/bus";
import { getEconomy, type Wallet } from "../state/economyAdapter";
import { useUxStore } from "../state/uiStore";
import { getCatalog, type ShopItem } from "./catalog";
import s from "./shop.module.css";

type Mode = "buy" | "sell";

export function Shop() {
  const open = useUxStore((st) => st.shop.open);
  const vendorId = useUxStore((st) => st.shop.vendorId);
  const closeShop = useUxStore((st) => st.closeShop);
  const reduce = useReducedMotion();

  const catalog = useMemo(() => getCatalog(vendorId), [vendorId]);
  const categories = useMemo(
    () => Array.from(new Set(catalog.items.map((i) => i.category))),
    [catalog],
  );

  const [mode, setMode] = useState<Mode>("buy");
  const [cat, setCat] = useState<string>(categories[0] ?? "");
  const [selId, setSelId] = useState<string | null>(null);
  const [wallet, setWallet] = useState<Wallet>(() => getEconomy().getWallet());
  const [busy, setBusy] = useState(false);

  // Reset view when the vendor changes.
  useEffect(() => {
    setMode("buy");
    setCat(categories[0] ?? "");
    setSelId(null);
  }, [catalog, categories]);

  // Live wallet.
  useEffect(() => {
    if (!open) return;
    const unsub = getEconomy().subscribe(setWallet);
    const onWallet = (w: Wallet) => setWallet(w);
    gameEvents.on("economy:wallet", onWallet);
    setWallet(getEconomy().getWallet());
    return () => {
      unsub();
      gameEvents.off("economy:wallet", onWallet);
    };
  }, [open]);

  const visible = useMemo(
    () => catalog.items.filter((i) => i.category === cat && (mode === "buy" || i.sellable)),
    [catalog, cat, mode],
  );
  const selected = visible.find((i) => i.id === selId) ?? visible[0] ?? null;

  const resale = catalog.resale ?? 0.5;
  const priceOf = (item: ShopItem) =>
    mode === "sell" ? Math.round(item.price * resale) : item.price;

  const canAfford = (item: ShopItem) =>
    mode === "sell" || getEconomy().canAfford(item.price, item.currency);

  const transact = (item: ShopItem) => {
    if (busy || item.lockedReason) return;
    const econ = getEconomy();
    if (mode === "buy") {
      if (!econ.canAfford(item.price, item.currency)) {
        gameEvents.emit("toast", { kind: "info", text: "Not enough cash", sub: item.name });
        return;
      }
      setBusy(true);
      if (econ.charge(item.price, item.currency)) {
        econ.grant(item.grants);
        gameEvents.emit("toast", {
          kind: "cash",
          text: `-${formatMoney(item.price)} · ${item.name}`,
          sub: "Purchased",
        });
      }
    } else {
      const refund = Math.round(item.price * resale);
      setBusy(true);
      econ.grant({ cash: refund });
      gameEvents.emit("toast", {
        kind: "cash",
        text: `+${formatMoney(refund)} · ${item.name}`,
        sub: "Sold",
      });
    }
    setTimeout(() => setBusy(false), 140);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className={`${s.backdrop} ux-interactive`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduce ? 0 : 0.22 }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeShop();
          }}
        >
          <FocusScope onEscape={closeShop}>
            <motion.div
              className={s.shop}
              role="dialog"
              aria-modal="true"
              aria-label={catalog.name}
              initial={{ opacity: 0, y: reduce ? 0 : 24, scale: reduce ? 1 : 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: reduce ? 0 : 16 }}
              transition={{ duration: reduce ? 0 : 0.34, ease: [0.16, 1, 0.3, 1] }}
            >
              <header className={s.head} style={{ "--vendor": catalog.accent } as CSSProperties}>
                <div className={s.headMeta}>
                  <div className={s.vendorName}>{catalog.name}</div>
                  <div className={s.vendorTag}>{catalog.tagline}</div>
                </div>
                <div className={s.headRight}>
                  <div className={s.balance}>
                    <span className={s.balanceLabel}>Clean</span>
                    <Money value={wallet.clean} />
                  </div>
                  <button className={s.close} onClick={closeShop} aria-label="Close shop">
                    <Icon name="close" size={18} />
                  </button>
                </div>
              </header>

              <div className={s.modeRow}>
                <div className={s.segmented} role="tablist" aria-label="Buy or sell">
                  {(["buy", "sell"] as Mode[]).map((m) => (
                    <button
                      key={m}
                      role="tab"
                      aria-selected={mode === m}
                      className={cx(s.segment, mode === m && s.segmentOn)}
                      onClick={() => setMode(m)}
                    >
                      {m === "buy" ? "Buy" : "Sell"}
                    </button>
                  ))}
                </div>
                <div className={s.tabs}>
                  {categories.map((c) => (
                    <button
                      key={c}
                      className={cx(s.tab, cat === c && s.tabOn)}
                      onClick={() => {
                        setCat(c);
                        setSelId(null);
                      }}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              <div className={s.grid}>
                <ul className={s.list}>
                  {visible.length === 0 && <li className={s.empty}>Nothing to {mode} here.</li>}
                  {visible.map((item) => {
                    const affordable = canAfford(item);
                    const locked = !!item.lockedReason;
                    return (
                      <li key={item.id}>
                        <button
                          className={cx(s.row, selected?.id === item.id && s.rowOn, locked && s.rowLocked)}
                          onClick={() => setSelId(item.id)}
                        >
                          <span className={s.rowIcon}>
                            <Icon name={item.icon ?? "bag"} size={18} />
                          </span>
                          <span className={s.rowMeta}>
                            <span className={s.rowName}>
                              {item.name}
                              {item.tag && <span className={s.rowChip}>{item.tag}</span>}
                            </span>
                            <span className={s.rowDesc}>
                              {locked ? item.lockedReason : item.desc}
                            </span>
                          </span>
                          <span className={cx(s.rowPrice, !affordable && !locked && s.rowUnafford)}>
                            {formatMoney(priceOf(item))}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>

                <div className={s.detail}>
                  {selected ? (
                    <>
                      <div className={s.detailIcon}>
                        <Icon name={selected.icon ?? "bag"} size={40} />
                      </div>
                      <div className={s.detailName}>{selected.name}</div>
                      <div className={s.detailCat}>{selected.category}</div>
                      <p className={s.detailDesc}>{selected.desc}</p>
                      <div className={s.detailPrice}>
                        <span className={s.detailPriceLabel}>{mode === "sell" ? "Resale" : "Price"}</span>
                        <Money value={priceOf(selected)} tag={selected.currency} />
                      </div>
                      {selected.lockedReason ? (
                        <div className={s.locked}>
                          <Icon name="shield" size={16} /> {selected.lockedReason}
                        </div>
                      ) : (
                        <Button
                          variant={mode === "sell" ? "ghost" : "primary"}
                          size="lg"
                          block
                          disabled={busy || (mode === "buy" && !canAfford(selected))}
                          onClick={() => transact(selected)}
                          leading={<Icon name={mode === "sell" ? "cash" : "bag"} size={18} />}
                        >
                          {mode === "sell"
                            ? `Sell · ${formatMoney(priceOf(selected))}`
                            : canAfford(selected)
                              ? `Buy · ${formatMoney(selected.price)}`
                              : "Not enough cash"}
                        </Button>
                      )}
                    </>
                  ) : (
                    <div className={s.empty}>Select an item.</div>
                  )}
                </div>
              </div>
            </motion.div>
          </FocusScope>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
