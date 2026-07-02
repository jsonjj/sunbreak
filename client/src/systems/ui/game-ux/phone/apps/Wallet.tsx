// Phone Wallet app — clean / dirty / Crew Stash balances via the economy seam. Subscribes to
// wallet changes (both the adapter's store subscription and `economy:wallet` events) so it stays
// live without polling per frame.
import { useEffect, useState } from "react";
import { getEconomy, type Wallet as WalletDto } from "../../state/economyAdapter";
import { gameEvents } from "../../state/bus";
import { Money } from "../../kit/Money";
import { Icon, type IconName } from "../../kit/Icon";
import s from "../phone.module.css";

const ROWS: { key: keyof WalletDto; label: string; note: string; icon: IconName; accent: string }[] = [
  { key: "clean", label: "Clean", note: "Spend anywhere", icon: "cash", accent: "var(--ux-cash)" },
  { key: "dirty", label: "Dirty", note: "Launder before you flaunt", icon: "wallet", accent: "var(--ux-heat-3)" },
  { key: "stash", label: "Crew Stash", note: "Shared pool", icon: "shield", accent: "var(--ux-accent-indigo)" },
];

export function Wallet() {
  const [w, setW] = useState<WalletDto>(() => getEconomy().getWallet());

  useEffect(() => {
    const unsub = getEconomy().subscribe(setW);
    const onWallet = (p: WalletDto) => setW(p);
    gameEvents.on("economy:wallet", onWallet);
    setW(getEconomy().getWallet());
    return () => {
      unsub();
      gameEvents.off("economy:wallet", onWallet);
    };
  }, []);

  const total = w.clean + w.stash;

  return (
    <div className={s.wallet}>
      <div className={s.walletHero}>
        <span className={s.walletHeroLabel}>Spendable</span>
        <Money value={total} className={s.walletHeroValue} />
      </div>
      <div className={s.walletRows}>
        {ROWS.map((r) => (
          <div key={r.key} className={s.walletRow}>
            <span className={s.walletIcon} style={{ color: r.accent }}>
              <Icon name={r.icon} size={18} />
            </span>
            <span className={s.walletMeta}>
              <span className={s.walletLabel}>{r.label}</span>
              <span className={s.walletNote}>{r.note}</span>
            </span>
            <Money value={w[r.key]} className={s.walletAmount} />
          </div>
        ))}
      </div>
    </div>
  );
}
