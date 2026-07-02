// Always-visible quick bar for the most-used toggles and cheats, so they're reachable without
// opening the console or Leva. A DOM sibling of the canvas.

import { useDebugStore } from "../store/debugStore";
import { cheats } from "../cheats/cheats";
import { panelStyle, buttonStyle, buttonActiveStyle, C } from "./ui";

function Btn({ label, onClick, active }: { label: string; onClick: () => void; active?: boolean }) {
  return (
    <button style={active ? buttonActiveStyle : buttonStyle} onClick={onClick}>
      {label}
    </button>
  );
}

export function CheatBar() {
  const overlay = useDebugStore((s) => s.overlay);
  const consoleOpen = useDebugStore((s) => s.console);
  const inspector = useDebugStore((s) => s.inspector);
  const leva = useDebugStore((s) => s.leva);
  const god = useDebugStore((s) => s.god);
  const physicsDebug = useDebugStore((s) => s.physicsDebug);
  const store = useDebugStore.getState();

  return (
    <div
      style={{
        ...panelStyle,
        top: 12,
        left: "50%",
        transform: "translateX(-50%)",
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: 6,
        maxWidth: "96vw",
        flexWrap: "wrap",
      }}
    >
      <span style={{ color: C.dim, fontSize: 10, letterSpacing: 0.6, padding: "0 6px" }}>
        SUNBREAK · DEBUG
      </span>
      <Btn label={`overlay:${overlay}`} onClick={() => store.cycleOverlay()} active={overlay !== "off"} />
      <Btn label="leva" onClick={() => store.toggle("leva")} active={leva} />
      <Btn label="inspect" onClick={() => store.toggle("inspector")} active={inspector} />
      <Btn label="console" onClick={() => store.toggle("console")} active={consoleOpen} />
      <Btn label="phys" onClick={() => store.toggle("physicsDebug")} active={physicsDebug} />
      <span style={{ width: 1, height: 18, background: C.border, margin: "0 2px" }} />
      <Btn label="god" onClick={() => cheats.setGod()} active={god} />
      <Btn label="heal" onClick={() => cheats.heal()} />
      <Btn label="+car" onClick={() => cheats.spawnEntity("car")} />
      <Btn label="+prop" onClick={() => cheats.spawnEntity("prop")} />
      <Btn label="kill" onClick={() => cheats.killDbgSpawned()} />
    </div>
  );
}
