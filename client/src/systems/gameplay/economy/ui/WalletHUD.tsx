// Compact glass wallet card (top-right). Subscribes to narrow slices only, so a cash tick
// never re-renders the shop/skills panels. Buttons open the shop + skills surfaces.
import { CharacterId } from "@sunbreak/shared";
import { useActiveChar, useBank, useCash, useCrew, useDirtyCash } from "../hooks";
import { money, moneyShort } from "./format";

const CHAR_LABEL: Record<CharacterId, string> = {
  [CharacterId.Cami]: "Cami",
  [CharacterId.Mac]: "Mac",
};

interface Props {
  onOpenShop: () => void;
  onOpenSkills: () => void;
}

export function WalletHUD({ onOpenShop, onOpenSkills }: Props) {
  const char = useActiveChar();
  const cash = useCash();
  const bank = useBank();
  const dirty = useDirtyCash();
  const crew = useCrew();

  return (
    <div className="econ-wallet">
      <div className="econ-wallet__head">
        <span className="econ-wallet__char">{CHAR_LABEL[char] ?? char}</span>
      </div>
      <div className="econ-wallet__cash">{money(cash)}</div>

      <div className="econ-wallet__row">
        <div className="econ-wallet__meta">
          <b>{moneyShort(bank)}</b>
          <span className="econ-wallet__label">Bank</span>
        </div>
        {dirty > 0 && (
          <div className="econ-wallet__meta is-dirty">
            <b>{moneyShort(dirty)}</b>
            <span className="econ-wallet__label">Dirty</span>
          </div>
        )}
        <div className="econ-wallet__meta">
          <b>{moneyShort(crew)}</b>
          <span className="econ-wallet__label">Crew</span>
        </div>
      </div>

      <div className="econ-wallet__actions">
        <button type="button" className="econ-chip-btn" onClick={onOpenShop}>
          Shop
        </button>
        <button type="button" className="econ-chip-btn" onClick={onOpenSkills}>
          Skills
        </button>
      </div>
    </div>
  );
}
