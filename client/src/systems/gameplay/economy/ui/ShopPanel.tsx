// Shop modal — tabbed storefront (weapons / vehicles / clothing / business) wired to the
// catalog + store. Buying deducts cash and adds to inventory/owned; locked items show their
// skill gate; owned items are marked. All purchase logic goes through the store action.
import { useMemo, useState } from "react";
import { catalogByShop, isBusiness } from "../catalog";
import { SKILL_LABELS } from "../constants";
import { useCash, useSkills } from "../hooks";
import { meetsRequirement, priceOf, skillLevelFromXp } from "../rules";
import { useEconomy } from "../store/economyStore";
import type { CatalogItem, PurchaseFailure, ShopKind } from "../types";
import { money } from "./format";

const TABS: { id: ShopKind; label: string }[] = [
  { id: "weapons", label: "Weapons" },
  { id: "vehicles", label: "Vehicles" },
  { id: "clothing", label: "Clothing" },
  { id: "business", label: "Business" },
];

function reasonText(reason: PurchaseFailure, name: string): string {
  switch (reason) {
    case "insufficient_funds":
      return `Not enough cash for ${name}`;
    case "already_owned":
      return `You already own ${name}`;
    case "locked":
      return `${name} is locked`;
    default:
      return `Couldn't buy ${name}`;
  }
}

export function ShopPanel({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<ShopKind>("weapons");
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);

  const cash = useCash();
  const skills = useSkills();
  const buyItem = useEconomy((s) => s.buyItem);
  const inventory = useEconomy((s) => s.inventory);
  const ownedAssets = useEconomy((s) => s.owned);

  const items = useMemo(() => catalogByShop(tab), [tab]);
  const ownedSet = useMemo(
    () => new Set<string>([...inventory, ...ownedAssets.map((a) => a.id)]),
    [inventory, ownedAssets],
  );

  const buy = (item: CatalogItem) => {
    const r = buyItem(item.id);
    setToast(r.ok ? { ok: true, text: `Purchased ${item.name}` } : { ok: false, text: reasonText(r.reason, item.name) });
  };

  const onBackdrop = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div className="econ-scrim" onMouseDown={onBackdrop}>
      <div className="econ-panel" role="dialog" aria-modal="true" aria-label="Shop">
        <div className="econ-panel__top">
          <div className="econ-panel__kicker">Verano Market</div>
          <h2 className="econ-panel__title">Storefront</h2>
          <div className="econ-panel__balance">
            <span className="econ-wallet__label">On hand</span>
            <br />
            <b>{money(cash)}</b>
          </div>
          <button type="button" className="econ-panel__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="econ-tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`econ-tab ${tab === t.id ? "is-active" : ""}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {toast && <div className={`econ-toast ${toast.ok ? "is-ok" : "is-err"}`}>{toast.text}</div>}

        <div className="econ-body">
          <div className="econ-grid">
            {items.map((item) => {
              const owned = ownedSet.has(item.id);
              const locked = !meetsRequirement(skills, item);
              const price = priceOf(item);
              const affordable = cash >= price;
              const gate = item.requires;
              return (
                <div
                  key={item.id}
                  className={`econ-card ${owned ? "is-owned" : ""} ${locked && !owned ? "is-locked" : ""}`}
                >
                  <div className="econ-card__head">
                    <div>
                      <div className="econ-card__name">{item.name}</div>
                    </div>
                    <span className="econ-tier" data-tier={item.tier}>
                      T{item.tier}
                    </span>
                  </div>
                  <div className="econ-card__blurb">{item.blurb}</div>
                  {isBusiness(item) && (
                    <div className="econ-card__income">+{money(item.incomePerMin)}/min passive</div>
                  )}
                  <div className="econ-card__foot">
                    <div>
                      <div className="econ-card__price">{money(price)}</div>
                      {locked && !owned && gate && (
                        <div className="econ-lock">
                          Needs {SKILL_LABELS[gate.skill]} {gate.level}
                          {` (${skillLevelFromXp(skills[gate.skill]?.xp ?? 0)})`}
                        </div>
                      )}
                    </div>
                    {owned ? (
                      <span className="econ-owned-tag">OWNED</span>
                    ) : (
                      <button
                        type="button"
                        className="econ-buy"
                        disabled={locked || !affordable}
                        onClick={() => buy(item)}
                      >
                        {locked ? "Locked" : affordable ? "Buy" : "Short"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
