import { CharacterId } from "@sunbreak/shared";
import { input } from "@/input/InputManager";
import { cx } from "../lib/cx";
import { formatMoney } from "../lib/format";
import { useGameStore } from "../lib/stores";
import { Button, Panel } from "../components/primitives";
import { IconPlay, IconSettings, IconCheck, IconChevronRight, IconSave } from "../lib/icons";
import { savegameApi, useSavegameStore } from "@/systems/gameplay/savegame";
import menu from "../styles/menu.module.css";

interface Lead {
  id: CharacterId;
  name: string;
  role: string;
  letter: string;
  grad: string;
}
const LEADS: Lead[] = [
  { id: CharacterId.Cami, name: "Cami", role: "The Driver", letter: "C", grad: "linear-gradient(135deg,#ffcf6b,#ff7a59)" },
  { id: CharacterId.Mac, name: "Mac", role: "The Fixer", letter: "M", grad: "linear-gradient(135deg,#ff5c8a,#7c6bff)" },
];

/** Landing — hero, one clear primary CTA, character select, and save slots. */
export function MainMenu({ onOpenSettings }: { onOpenSettings: () => void }) {
  const activeCharacter = useGameStore((s) => s.activeCharacter);
  const switchCharacter = useGameStore((s) => s.switchCharacter);
  const setPhase = useGameStore((s) => s.setPhase);

  const metas = useSavegameStore((s) => s.metas);

  const start = () => {
    setPhase("playing");
    input.requestLock();
  };

  // Save slots: load an existing slot, or start a fresh run bound to an empty one.
  const startSlot = (n: number) => {
    if (savegameApi.hasSave(n)) savegameApi.load(n);
    else savegameApi.newGame(n);
    setPhase("playing");
    input.requestLock();
  };

  return (
    <div className={menu.screen}>
      <div className={menu.backdrop} />
      <div className={menu.wrap}>
        <div className={menu.topbar}>
          <div className={menu.brand}>
            <div className={menu.brandMark} />
            <span className={menu.brandName}>SUNBREAK</span>
          </div>
          <div className={menu.topActions}>
            <Button variant="ghost" icon={<IconSettings size={17} />} onClick={onOpenSettings}>
              Settings
            </Button>
          </div>
        </div>

        <div className={menu.hero}>
          <div className={menu.heroCopy}>
            <span className={menu.heroKicker}>
              <i className={menu.heroDot} /> Open world · Santa Vista
            </span>
            <h1 className={menu.heroTitle}>
              Chase the
              <br />
              <em>sunbreak</em>.
            </h1>
            <p className={menu.heroSub}>
              A free, browser-native open world on the Verano coast. Drive, hustle, and outrun the
              heat as golden day burns into neon dusk.
            </p>
            <div className={menu.heroActions}>
              <Button variant="primary" size="lg" icon={<IconPlay size={18} />} onClick={start}>
                Enter Santa Vista
              </Button>
              <Button variant="ghost" size="lg" onClick={onOpenSettings}>
                Settings
              </Button>
            </div>
          </div>

          <Panel className={menu.sideCard}>
            <div>
              <div className={menu.sideTitle}>Choose your lead</div>
              <div className={menu.chars} style={{ marginTop: 12 }}>
                {LEADS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={cx(menu.charCard, activeCharacter === c.id && menu.charCardOn)}
                    onClick={() => switchCharacter(c.id)}
                    aria-pressed={activeCharacter === c.id}
                  >
                    <span className={menu.charCheck}>
                      <IconCheck size={18} />
                    </span>
                    <span className={menu.charAvatar} style={{ background: c.grad }}>
                      {c.letter}
                    </span>
                    <span className={menu.charName}>{c.name}</span>
                    <span className={menu.charRole}>{c.role}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className={menu.sideTitle}>Save slots</div>
              <div className={menu.slots} style={{ marginTop: 12 }}>
                {[1, 2, 3].map((n) => {
                  const meta = metas[n - 1];
                  return (
                    <button key={n} type="button" className={menu.slot} onClick={() => startSlot(n)}>
                      <span className={menu.slotIcon}>
                        <IconSave size={16} />
                      </span>
                      <span className={menu.slotText}>
                        <span className={menu.slotName}>
                          {meta ? `Slot ${n} · ${meta.character === CharacterId.Cami ? "Cami" : "Mac"}` : `Slot ${n}`}
                        </span>
                        <span className={menu.slotMeta}>
                          {meta
                            ? `${formatMoney(meta.cash)} · ${new Date(meta.savedAt).toLocaleDateString()}`
                            : "Empty · start a new story"}
                        </span>
                      </span>
                      <span className={menu.slotArrow}>
                        <IconChevronRight size={18} />
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </Panel>
        </div>

        <div className={menu.footer}>
          <span>100% free · runs in your browser · no downloads</span>
          <span>v0 · Verano build</span>
        </div>
      </div>
    </div>
  );
}
