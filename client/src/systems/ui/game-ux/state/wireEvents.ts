// Maps the typed bus onto the Zustand store. Called once from the subsystem `init()` so the
// store is live even before <GameUXRoot> mounts; guarded to be idempotent under HMR / double
// registration. Returns an unwire cleanup.
import { gameEvents, type ToastKind } from "./bus";
import { getEconomy } from "./economyAdapter";
import { useUxStore } from "./uiStore";

let unwire: (() => void) | null = null;

export function wireEvents(): () => void {
  if (unwire) return unwire;
  const ux = useUxStore.getState;

  const onLoadingBegin = (p: { label?: string }) => ux().beginLoading(p?.label);
  const onLoadingEnd = () => ux().endLoading();

  const onDeath = (p: { cause?: string }) => {
    const fee = getEconomy().feeFor("hospital");
    ux().showState({
      variant: "wasted",
      word: "FLATLINE",
      subtitle: p?.cause ? p.cause : "You flatlined on the strip.",
      fee,
      cause: p?.cause,
      prompt: "Hold to check out of the ER",
    });
    ux().setCinematic({ desaturate: 1, vignette: 0.85, timescale: 0.35 });
  };
  const onRevive = () => ux().clearState();

  const onBusted = (p: { fee?: number; heatCleared?: boolean } | void) => {
    const d: { fee?: number; heatCleared?: boolean } = typeof p === "object" && p ? p : {};
    const fee = d.fee ?? getEconomy().feeFor("bribe");
    ux().showState({
      variant: "booked",
      word: "BOOKED",
      subtitle: "The task force booked you. HEAT wiped.",
      fee,
      prompt: "Hold to post bail",
    });
    ux().setCinematic({ desaturate: 0.6, vignette: 0.6, timescale: 1 });
  };
  const onReleased = () => ux().clearState();

  const onMissionStart = (p: {
    id: string;
    title: string;
    giver: string;
    objective: string;
  }) => ux().showMissionStart(p);
  const onObjective = (p: { id: string; text: string }) => ux().setObjective(p.text);

  const onMissionPass = (p: {
    id: string;
    title?: string;
    rewards?: { cash?: number; rep?: number; items?: string[] };
    medal?: string;
  }) => {
    ux().showMissionResult({ id: p.id, pass: true, title: p.title, rewards: p.rewards, medal: p.medal });
    // Missions/Economy own the actual award; game-ux only celebrates it.
    if (p.rewards?.cash)
      ux().pushToast({ kind: "cash", text: `+$${p.rewards.cash.toLocaleString()}`, sub: "Score payout", priority: 2, ttl: 5000 });
    if (p.rewards?.rep)
      ux().pushToast({ kind: "info", text: `+${p.rewards.rep} Rep`, priority: 1, ttl: 5000 });
  };
  const onMissionFail = (p: { id: string; title?: string; reason: string }) =>
    ux().showMissionResult({ id: p.id, pass: false, title: p.title, reason: p.reason });

  const onToast = (p: {
    kind?: ToastKind;
    text: string;
    sub?: string;
    icon?: string;
    ttl?: number;
    priority?: number;
  }) =>
    ux().pushToast({
      kind: p.kind ?? "info",
      text: p.text,
      sub: p.sub,
      icon: p.icon,
      ttl: p.ttl,
      priority: p.priority ?? 0,
    });

  const onShopOpen = (p: { vendorId: string }) => ux().openShop(p.vendorId);
  const onShopClose = () => ux().closeShop();
  const onPhoneOpen = (p: { app?: string } | void) => {
    const d: { app?: string } = typeof p === "object" && p ? p : {};
    ux().openPhone(d.app);
  };
  const onPhoneClose = () => ux().closePhone();
  const onPhoneToggle = () => ux().togglePhone();
  const onPhoneMessage = (p: { npcId: string; preview: string }) =>
    ux().pushToast({ kind: "info", text: p.preview, sub: "New message", icon: "message", ttl: 6000, priority: 1 });

  gameEvents.on("loading:begin", onLoadingBegin);
  gameEvents.on("loading:end", onLoadingEnd);
  gameEvents.on("player:death", onDeath);
  gameEvents.on("player:revive", onRevive);
  gameEvents.on("player:busted", onBusted);
  gameEvents.on("player:released", onReleased);
  gameEvents.on("mission:start", onMissionStart);
  gameEvents.on("mission:objective", onObjective);
  gameEvents.on("mission:pass", onMissionPass);
  gameEvents.on("mission:fail", onMissionFail);
  gameEvents.on("toast", onToast);
  gameEvents.on("shop:open", onShopOpen);
  gameEvents.on("shop:close", onShopClose);
  gameEvents.on("phone:open", onPhoneOpen);
  gameEvents.on("phone:close", onPhoneClose);
  gameEvents.on("phone:toggle", onPhoneToggle);
  gameEvents.on("phone:message", onPhoneMessage);

  unwire = () => {
    gameEvents.off("loading:begin", onLoadingBegin);
    gameEvents.off("loading:end", onLoadingEnd);
    gameEvents.off("player:death", onDeath);
    gameEvents.off("player:revive", onRevive);
    gameEvents.off("player:busted", onBusted);
    gameEvents.off("player:released", onReleased);
    gameEvents.off("mission:start", onMissionStart);
    gameEvents.off("mission:objective", onObjective);
    gameEvents.off("mission:pass", onMissionPass);
    gameEvents.off("mission:fail", onMissionFail);
    gameEvents.off("toast", onToast);
    gameEvents.off("shop:open", onShopOpen);
    gameEvents.off("shop:close", onShopClose);
    gameEvents.off("phone:open", onPhoneOpen);
    gameEvents.off("phone:close", onPhoneClose);
    gameEvents.off("phone:toggle", onPhoneToggle);
    gameEvents.off("phone:message", onPhoneMessage);
    unwire = null;
  };
  return unwire;
}
