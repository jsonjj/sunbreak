// ActivityManager — orchestrates the subsystem: validate + load content, publish giver markers
// (interaction entries + map blips), run the local proximity/prompt fallback, and drive the run
// FSM every frame. All sibling coupling goes through ports (interaction / econ / blips).

import type { Vec3 } from "@sunbreak/shared";
import { world } from "@/ecs/world";
import { useUiStore } from "@/stores/ui.store";
import type { ClientEntity } from "@/ecs/clientEntity";
import { rawActivityDefs } from "./data";
import { parseActivityDefs } from "./schema";
import { getPorts, type InteractionEntry } from "./ports";
import { ActivityRuntime, type RuntimeHost } from "./runtime/ActivityRuntime";
import { useActivityStore } from "./runtime/store";
import { activityNodes } from "./spawn";
import { createKeyEdges, type KeyEdges } from "./keys";
import { planarDist2, tupleToVec3, withinPlanar } from "./util";
import type { ActivityDef } from "./types";

const FOCUS_INTERVAL = 1 / 15; // 15 Hz focus/prompt refresh (per interaction spec)
const markerBlipId = (id: string): string => `act_marker_${id}`;
const offerEntryId = (id: string): string => `act_offer_${id}`;

class ActivityManager {
  enabled = true;

  private readonly defs = new Map<string, ActivityDef>();
  private readonly markers = new Map<string, ActivityDef>(); // entryId → def
  private readonly cooldownUntil = new Map<string, number>();
  private readonly unregisters: Array<() => void> = [];
  private readonly runtime: ActivityRuntime;

  private readonly players = world.with("isPlayer", "transform");
  private keys: KeyEdges | null = null;
  private loaded = false;
  private focusAcc = 0;
  private focused: InteractionEntry | null = null;
  private promptShown: string | null = null;
  private offerId: string | null = null;

  constructor() {
    const host: RuntimeHost = {
      playerPos: () => this.playerPos(),
      blips: () => getPorts().blips,
      onFinished: (result, cooldownMs) => {
        if (cooldownMs > 0) this.cooldownUntil.set(result.activityId, performance.now() + cooldownMs);
      },
    };
    this.runtime = new ActivityRuntime(host);
  }

  // ── lifecycle ──────────────────────────────────────────────────────────────
  init(): () => void {
    this.load();
    this.keys = createKeyEdges();
    return () => this.dispose();
  }

  load(): void {
    if (this.loaded) return;
    this.loaded = true;
    const defs = parseActivityDefs(rawActivityDefs);
    const ports = getPorts();
    for (const def of defs) {
      this.defs.set(def.id, def);
      const entryId = offerEntryId(def.id);
      this.markers.set(entryId, def);
      ports.blips.upsert({
        id: markerBlipId(def.id),
        x: def.origin[0],
        z: def.origin[2],
        kind: "mission",
        label: def.name,
      });
      const unreg = ports.interaction.register({
        id: entryId,
        kind: "activity_start",
        range: def.markerRadius ?? 5,
        getPosition: () => tupleToVec3(def.origin),
        getPrompt: () => this.markerPrompt(def),
        onInteract: () => this.tryStart(def.id),
      });
      this.unregisters.push(unreg);
    }
    console.info(`[activities] loaded ${defs.length} activities`);
  }

  /**
   * Re-register markers/blips against the CURRENT ports. Call after configureActivityPorts() when
   * ports are injected post-boot, so givers appear on the real Map store and route through the
   * real Interaction system. (Stale fallback blips on the previous port are harmless.)
   */
  reload(): void {
    for (const u of this.unregisters) u();
    this.unregisters.length = 0;
    this.defs.clear();
    this.markers.clear();
    this.loaded = false;
    this.load();
  }

  dispose(): void {
    this.keys?.dispose();
    this.keys = null;
    if (this.runtime.busy) this.runtime.cancel();
    for (const u of this.unregisters) u();
    this.unregisters.length = 0;
    getPorts().blips.clearOwned();
    this.clearPrompt();
    this.setOfferFor(null);
    this.defs.clear();
    this.markers.clear();
    this.loaded = false;
  }

  // ── per-frame ──────────────────────────────────────────────────────────────
  tick(dt: number): void {
    if (!this.enabled) return;
    const ports = getPorts();

    if (ports.interaction.local) {
      this.focusAcc += dt;
      if (this.focusAcc >= FOCUS_INTERVAL) {
        this.focusAcc = 0;
        this.updateFocus(ports.interaction.entries());
      }
      this.handleKeys();
    }

    this.runtime.tick(dt);
    this.keys?.endFrame();
  }

  /** Recompute the focused interactable + prompt/offer (throttled). */
  private updateFocus(entries: InteractionEntry[]): void {
    if (this.runtime.busy) {
      this.focused = null;
      this.setOfferFor(null);
      this.setPrompt(`Press X to cancel ${useActivityStore.getState().run?.name ?? "activity"}`);
      return;
    }
    const pos = this.playerPos();
    if (!pos) {
      this.focused = null;
      this.setOfferFor(null);
      this.clearPrompt();
      return;
    }

    let best: InteractionEntry | null = null;
    let bestPrompt: string | null = null;
    let bestD2 = Infinity;
    for (const e of entries) {
      const prompt = e.getPrompt();
      if (prompt == null) continue;
      const d2 = planarDist2(pos, e.getPosition());
      if (d2 > e.range * e.range) continue;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = e;
        bestPrompt = prompt;
      }
    }

    this.focused = best;
    if (best && bestPrompt) {
      this.setPrompt(bestPrompt);
      this.setOfferFor(this.markers.get(best.id) ?? null);
    } else {
      this.clearPrompt();
      this.setOfferFor(null);
    }
  }

  /** Consume interact/cancel keys every frame against the cached focus. */
  private handleKeys(): void {
    if (!this.keys) return;
    if (this.runtime.busy) {
      if (this.keys.consume("x")) this.runtime.cancel();
      return;
    }
    if (this.focused && (this.keys.consume("e") || this.keys.consume("enter"))) {
      this.focused.onInteract();
    }
  }

  // ── triggering ───────────────────────────────────────────────────────────
  private tryStart(id: string): boolean {
    if (!this.enabled || this.runtime.busy) return false;
    const def = this.defs.get(id);
    if (!def) return false;
    const cd = this.cooldownUntil.get(id);
    if (cd != null && performance.now() < cd) return false;
    const ok = this.runtime.start(def);
    if (ok) {
      this.setOfferFor(null);
      this.clearPrompt();
    }
    return ok;
  }

  // ── public / integration API ──────────────────────────────────────────────
  list(): Array<{ id: string; name: string; kind: ActivityDef["kind"] }> {
    return [...this.defs.values()].map((d) => ({ id: d.id, name: d.name, kind: d.kind }));
  }

  /** Force-start by id (debug / external trigger). Ignores cooldown. */
  start(id: string): boolean {
    if (!this.enabled || this.runtime.busy) return false;
    const def = this.defs.get(id);
    return def ? this.runtime.start(def) : false;
  }

  cancel(): void {
    this.runtime.cancel();
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on && this.runtime.busy) this.runtime.cancel();
  }

  /** Combat seam: report a hit at a world position; credits any rampage target there. */
  notifyHitAt(pos: Vec3): void {
    const hits: ClientEntity[] = [];
    for (const e of activityNodes) {
      const node = e.act_node;
      if (node?.role !== "target" || !e.transform) continue;
      if (withinPlanar(pos, e.transform.position, node.radius)) hits.push(e);
    }
    for (const e of hits) this.runtime.creditTarget(e);
  }

  // ── helpers ────────────────────────────────────────────────────────────────
  private playerPos(): Vec3 | null {
    const p = this.players.entities[0];
    return p?.transform ? p.transform.position : null;
  }

  private markerPrompt(def: ActivityDef): string | null {
    if (this.runtime.busy) return null;
    const cd = this.cooldownUntil.get(def.id);
    if (cd != null && performance.now() < cd) return null;
    return `Press E — ${def.name} · ${this.rewardText(def)}`;
  }

  private rewardText(def: ActivityDef): string {
    const tierCash = (def.rewardTiers ?? []).map((t) => t.reward.cash ?? 0);
    let best = Math.max(def.reward.cash ?? 0, 0, ...tierCash);
    if (def.kind === "delivery") best += def.legs.reduce((s, l) => s + (l.payout ?? 0), 0);
    return best > 0 ? `up to $${best.toLocaleString()}` : "reward";
  }

  private setPrompt(text: string): void {
    if (text === this.promptShown) return;
    useUiStore.getState().setContextPrompt(text);
    this.promptShown = text;
  }

  private clearPrompt(): void {
    if (this.promptShown == null) return;
    const ui = useUiStore.getState();
    if (ui.contextPrompt === this.promptShown) ui.setContextPrompt(null);
    this.promptShown = null;
  }

  private setOfferFor(def: ActivityDef | null): void {
    if ((def?.id ?? null) === this.offerId) return;
    this.offerId = def?.id ?? null;
    useActivityStore
      .getState()
      .setOffer(
        def
          ? { activityId: def.id, name: def.name, blurb: def.blurb, rewardText: this.rewardText(def) }
          : null,
      );
  }
}

export const activityManager = new ActivityManager();
