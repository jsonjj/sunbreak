// In-car radio controls. Keys are only handled while the player can control the radio (i.e. in a
// vehicle — supplied via `canControl`). No App/DOM mounting: a single window keydown listener.
//   [  prev station   ]  next station   \  toggle power   -/=  volume down/up
import { useRadioStore } from "./radioStore";

function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable === true;
}

export function installRadioInput(canControl: () => boolean): () => void {
  const onKey = (e: KeyboardEvent) => {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    if (isTypingTarget(e.target)) return;
    if (!canControl()) return;
    const s = useRadioStore.getState();
    switch (e.key) {
      case "]":
        s.nextStation();
        break;
      case "[":
        s.prevStation();
        break;
      case "\\":
        s.togglePower();
        break;
      case "-":
      case "_":
        s.setVolume(s.volume - 0.1);
        break;
      case "=":
      case "+":
        s.setVolume(s.volume + 0.1);
        break;
      default:
        return;
    }
    e.preventDefault();
  };
  window.addEventListener("keydown", onKey);
  return () => window.removeEventListener("keydown", onKey);
}
