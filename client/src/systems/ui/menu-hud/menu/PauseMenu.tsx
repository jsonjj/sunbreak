import { useState } from "react";
import type { PauseTab } from "@sunbreak/shared";
import { CharacterId } from "@sunbreak/shared";
import { input } from "@/input/InputManager";
import { formatMoney } from "../lib/format";
import { useGameStore, useHudStore, useUiStore } from "../lib/stores";
import { Button, Panel, Tabs } from "../components/primitives";
import type { TabItem } from "../components/primitives";
import { IconMap, IconFlag, IconChart, IconSettings, IconSave, IconExit, IconPlay } from "../lib/icons";
import { useMissionStore } from "@/systems/gameplay/missions";
import { savegameApi, useSavegameStore } from "@/systems/gameplay/savegame";
import menu from "../styles/menu.module.css";

/** Live mission summary — active mission + objectives, else available/completed counts. */
function MissionsTab() {
  const activeTitle = useMissionStore((s) => s.activeTitle);
  const stageTitle = useMissionStore((s) => s.activeStageTitle);
  const objectives = useMissionStore((s) => s.hudObjectives);
  const status = useMissionStore((s) => s.status);
  const entries = Object.values(status);
  const completed = entries.filter((e) => e.status === "completed");
  const available = entries.filter((e) => e.status === "available");

  return (
    <>
      <h3 className={menu.sectionTitle}>Missions</h3>
      {activeTitle ? (
        <>
          <p className={menu.sectionSub}>
            Active: {activeTitle}
            {stageTitle ? ` — ${stageTitle}` : ""}
          </p>
          <div className={menu.statGrid}>
            {objectives.length === 0 ? (
              <div className={menu.statCell}>
                <div className={menu.statCellLabel}>Objective</div>
                <div className={menu.statCellValue}>In progress</div>
              </div>
            ) : (
              objectives.map((o) => (
                <div key={o.id} className={menu.statCell}>
                  <div className={menu.statCellLabel}>
                    {o.state === "complete" ? "✓ " : "• "}
                    {o.label}
                  </div>
                  <div className={menu.statCellValue}>
                    {o.count ? `${o.count.have}/${o.count.need}` : o.state}
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      ) : (
        <>
          <p className={menu.sectionSub}>
            No active mission — {available.length} available · {completed.length} completed. Explore
            Santa Vista to pick up work.
          </p>
          {available.length > 0 ? (
            <div className={menu.mapStub}>
              Available now: {available.map((e) => e.title).join(" · ")}
            </div>
          ) : null}
        </>
      )}
    </>
  );
}

const TABS: TabItem<PauseTab>[] = [
  { value: "map", label: "Map", icon: <IconMap size={17} /> },
  { value: "missions", label: "Missions", icon: <IconFlag size={17} /> },
  { value: "stats", label: "Stats", icon: <IconChart size={17} /> },
];

/** Pause overlay — dims/blurs the live scene. Resume re-requests pointer-lock. */
export function PauseMenu({ onOpenSettings }: { onOpenSettings: () => void }) {
  const tab = useUiStore((s) => s.pauseTab);
  const setTab = useUiStore((s) => s.setPauseTab);
  const resume = useGameStore((s) => s.resume);
  const setPhase = useGameStore((s) => s.setPhase);
  const character = useGameStore((s) => s.activeCharacter);
  const cash = useHudStore((s) => s.cash);
  const bank = useHudStore((s) => s.bank);
  const currentSlot = useSavegameStore((s) => s.current);
  const [saved, setSaved] = useState(false);

  const doResume = () => {
    resume();
    input.requestLock();
  };

  const doSave = () => {
    savegameApi.save();
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1500);
  };

  return (
    <div className={menu.screen}>
      <div className={menu.dim} />
      <div className={menu.center}>
        <Panel className={menu.dialog}>
          <div className={menu.dialogHead}>
            <div>
              <div className={menu.dialogKicker}>Paused</div>
              <div className={menu.dialogTitle}>
                {character === CharacterId.Cami ? "Cami" : "Mac"} · Santa Vista
              </div>
            </div>
            <Button variant="primary" icon={<IconPlay size={16} />} hint="P" onClick={doResume}>
              Resume
            </Button>
          </div>

          <div className={menu.dialogBody}>
            <div className={menu.rail}>
              <Tabs value={tab} items={TABS} onChange={setTab} />
              <div className={menu.railSpacer} />
              <Button variant="ghost" icon={<IconSettings size={17} />} block onClick={onOpenSettings}>
                Settings
              </Button>
            </div>

            <div className={menu.content}>
              {tab === "stats" ? (
                <>
                  <h3 className={menu.sectionTitle}>Stats</h3>
                  <p className={menu.sectionSub}>Your current run at a glance.</p>
                  <div className={menu.statGrid}>
                    <div className={menu.statCell}>
                      <div className={menu.statCellLabel}>Cash</div>
                      <div className={menu.statCellValue}>{formatMoney(cash)}</div>
                    </div>
                    <div className={menu.statCell}>
                      <div className={menu.statCellLabel}>Bank</div>
                      <div className={menu.statCellValue}>{formatMoney(bank)}</div>
                    </div>
                    <div className={menu.statCell}>
                      <div className={menu.statCellLabel}>Lead</div>
                      <div className={menu.statCellValue}>
                        {character === CharacterId.Cami ? "Cami" : "Mac"}
                      </div>
                    </div>
                    <div className={menu.statCell}>
                      <div className={menu.statCellLabel}>Region</div>
                      <div className={menu.statCellValue}>Verano</div>
                    </div>
                  </div>
                </>
              ) : tab === "missions" ? (
                <MissionsTab />
              ) : (
                <>
                  <h3 className={menu.sectionTitle}>Map</h3>
                  <p className={menu.sectionSub}>The full pan-and-zoom map lands in v3.</p>
                  <div className={menu.mapStub}>Santa Vista · Verano coast</div>
                </>
              )}
            </div>
          </div>

          <div className={menu.footerBar}>
            <span className={menu.footerNote}>Progress saves to this browser.</span>
            <div style={{ display: "flex", gap: 10 }}>
              <Button variant="ghost" icon={<IconSave size={16} />} onClick={doSave}>
                {saved ? "Saved ✓" : `Save${currentSlot ? ` · Slot ${currentSlot}` : ""}`}
              </Button>
              <Button variant="secondary" icon={<IconExit size={16} />} onClick={() => setPhase("menu")}>
                Quit to menu
              </Button>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
