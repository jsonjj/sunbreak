// The onboarding brain: subscribes to the bus, drives the first-run cards, executes the intro
// mission (spawning/despawning its markers + targets through the ECS), matches contextual
// hints, and exposes replay/skip. All state that isn't display data lives here (module scope);
// the store holds only the serializable view state the DOM overlay reads.
import { InputAction } from "@sunbreak/shared";
import type { Vec3, Vec3Tuple } from "@sunbreak/shared";
import { world } from "@/ecs/world";
import { input } from "@/input/InputManager";
import type { ClientEntity } from "@/ecs/clientEntity";
import { bus, emitGameEvent } from "./bus";
import type { MoveDir, OnbEventKey, OnbGameEvents } from "./bus";
import { useOnboardingStore } from "./store";
import type { ActiveHint } from "./store";
import { getStep, stepCount } from "./steps";
import { hintsForEvent } from "./hints";
import { glyphsForAction } from "./glyphs";
import { t } from "./i18n/en";
import { firstGear } from "./mission/firstGear";
import type { BeatMarker, BeatTarget, MissionScript } from "./mission/missionApi";
import { onbQueries } from "./queries";

// ── module state (non-serializable / timing) ───────────────────────────────────
let missionScript: MissionScript | null = null;
let beatStartedAt = 0;
let stepStartedAt = 0;
let zoneTriggered = false;
let markerAccum = 0;
let spawned: ClientEntity[] = [];

const lastHintAt = new Map<string, number>();
const hintWindow: number[] = [];
const MAX_HINTS_PER_MIN = 5;
const MARKER_POLL_S = 0.16; // ~6 Hz distance/zone/timeout checks (spec: throttled, not per-frame)

let shownHintId: string | null = null;
let hintShownAt = 0;

// ── geometry helper (planar distance to a marker) ───────────────────────────────
function planarDistance(a: Vec3, b: Vec3Tuple): number {
  const dx = a.x - b[0];
  const dz = a.z - b[2];
  return Math.hypot(dx, dz);
}

// ── spawn / despawn intro props via the ECS↔R3F bridge ─────────────────────────
function tupleToVec3(p: Vec3Tuple): Vec3 {
  return { x: p[0], y: p[1], z: p[2] };
}

function spawnMarker(m: BeatMarker): void {
  const e: ClientEntity = {
    onb_intro: true,
    transform: { position: tupleToVec3(m.position), rotation: { x: 0, y: 0, z: 0, w: 1 } },
    onb_marker: { id: m.id, center: tupleToVec3(m.position), radius: m.radius, labelKey: m.labelKey },
  };
  world.add(e);
  spawned.push(e);
}

function spawnTarget(tg: BeatTarget): void {
  const e: ClientEntity = {
    onb_intro: true,
    transform: { position: tupleToVec3(tg.position), rotation: { x: 0, y: 0, z: 0, w: 1 } },
    onb_target: { id: tg.id },
  };
  world.add(e);
  spawned.push(e);
}

function despawnBeatEntities(): void {
  for (const e of spawned) world.remove(e);
  spawned = [];
}

function despawnAll(): void {
  despawnBeatEntities();
  for (const e of [...onbQueries.intro]) world.remove(e);
}

// ── first-run controls tutorial ────────────────────────────────────────────────
function startFirstRun(): void {
  const s0 = getStep(0);
  const store = useOnboardingStore.getState();
  store.setPhase("firstRun");
  store.setRunning(true);
  store.setStep(0, s0?.id ?? null);
  stepStartedAt = performance.now();
}

function advanceFirstRunStep(): void {
  const store = useOnboardingStore.getState();
  const next = store.stepIndex + 1;
  const step = getStep(next);
  if (next < stepCount && step) {
    store.setStep(next, step.id);
    stepStartedAt = performance.now();
  } else {
    startIntro();
  }
}

function handleFirstRun(type: OnbEventKey, payload: OnbGameEvents[OnbEventKey]): void {
  const store = useOnboardingStore.getState();
  if (store.phase !== "firstRun") return;
  const step = getStep(store.stepIndex);
  if (!step) return;

  switch (step.req.kind) {
    case "moveAll": {
      if (type === "player:move") {
        store.addMovedDir((payload as { dir: MoveDir }).dir);
        if (useOnboardingStore.getState().movedDirs.size >= 4) advanceFirstRunStep();
      }
      break;
    }
    case "look": {
      if (type === "player:look") {
        const p = payload as { dx: number; dy: number };
        store.addLook(Math.hypot(p.dx, p.dy));
        if (useOnboardingStore.getState().lookAmount >= step.req.threshold) advanceFirstRunStep();
      }
      break;
    }
    case "event": {
      if (type === step.req.on) advanceFirstRunStep();
      break;
    }
  }
}

// ── intro mission runtime ───────────────────────────────────────────────────────
function startIntro(): void {
  useOnboardingStore.getState().setPhase("intro");
  missionScript = firstGear;
  useOnboardingStore.getState().startMission(firstGear.id, firstGear.titleKey);
  enterBeat(0);
}

function enterBeat(index: number): void {
  if (!missionScript) return;
  const beat = missionScript.beats[index];
  if (!beat) {
    finishMission();
    return;
  }
  despawnBeatEntities();
  beatStartedAt = performance.now();
  zoneTriggered = false;
  markerAccum = 0;

  const store = useOnboardingStore.getState();
  store.setBeat(index, beat.id, beat.objectiveKey, beat.goal ?? 1);

  if (beat.marker) {
    spawnMarker(beat.marker);
    store.setMarker(beat.marker.labelKey ?? null, null);
  } else {
    store.setMarker(null, null);
  }
  if (beat.targets) for (const tg of beat.targets) spawnTarget(tg);
}

function progressBeat(inc: number): void {
  const store = useOnboardingStore.getState();
  const goal = store.beatGoal;
  const next = goal > 0 ? Math.min(goal, store.beatProgress + inc) : store.beatProgress + inc;
  store.setBeatProgress(next);
  if (goal > 0 && next >= goal) completeBeat();
}

function completeBeat(): void {
  if (!missionScript) return;
  const index = useOnboardingStore.getState().beatIndex;
  despawnBeatEntities();
  const next = index + 1;
  if (next < missionScript.beats.length) enterBeat(next);
  else finishMission();
}

function finishMission(): void {
  despawnAll();
  missionScript = null;
  useOnboardingStore.getState().markComplete(); // persists onboardingComplete → localStorage
  emitGameEvent("onboarding:complete");
}

function handleMission(type: OnbEventKey): void {
  const store = useOnboardingStore.getState();
  if (store.phase !== "intro" || !missionScript) return;
  const beat = missionScript.beats[store.beatIndex];
  if (!beat) return;

  let inc = 0;
  if (beat.completeOn.includes(type)) inc = 1;
  if (beat.fireCountsAsHit && !store.canvasMounted && type === "combat:fire") inc = 1;
  if (inc > 0) progressBeat(inc);
}

// ── contextual hints ────────────────────────────────────────────────────────────
function pruneHintWindow(now: number): void {
  while (hintWindow.length > 0 && now - (hintWindow[0] ?? now) > 60000) hintWindow.shift();
}

function handleHints(type: OnbEventKey, payload: OnbGameEvents[OnbEventKey]): void {
  const store = useOnboardingStore.getState();
  if (store.phase === "firstRun") return; // keep the guided cards uncluttered
  const defs = hintsForEvent(type);
  if (defs.length === 0) return;
  const now = performance.now();

  for (const def of defs) {
    const once = def.once ?? true;
    if (once && store.hasHint(def.id)) continue;
    if (!once) {
      const last = lastHintAt.get(def.id) ?? -Infinity;
      if (now - last < (def.cooldownMs ?? 20000)) continue;
    }
    if (def.when && !def.when(payload)) continue;

    pruneHintWindow(now);
    if (hintWindow.length >= MAX_HINTS_PER_MIN) break;

    const chips = def.glyphs ?? (def.glyphAction != null ? glyphsForAction(def.glyphAction) : []);
    const hint: ActiveHint = {
      id: def.id,
      text: t(def.i18nKey, { glyph: chips[0] ?? "" }),
      glyphs: chips,
      durationMs: def.durationMs ?? 4200,
    };
    useOnboardingStore.getState().enqueueHint(hint);
    if (once) useOnboardingStore.getState().markHintSeen(def.id);
    lastHintAt.set(def.id, now);
    hintWindow.push(now);
  }
}

// ── boot gating ─────────────────────────────────────────────────────────────────
function maybeAutoStart(): void {
  const store = useOnboardingStore.getState();
  if (store.onboardingComplete || store.phase !== "idle") return;
  // Start once the game is actually running: the local player exists and the user has engaged
  // (captured the mouse), so the cards are visible and look/move detection is meaningful.
  if (!onbQueries.player.entities[0] || !input.locked) return;
  startFirstRun();
}

// ── per-frame polling (throttled) ────────────────────────────────────────────────
function pollBeat(now: number): void {
  const store = useOnboardingStore.getState();
  if (store.phase !== "intro" || !missionScript) return;
  const beat = missionScript.beats[store.beatIndex];
  if (!beat) return;

  if (beat.marker) {
    const player = onbQueries.player.entities[0];
    if (player?.transform) {
      const d = planarDistance(player.transform.position, beat.marker.position);
      useOnboardingStore.getState().setMarker(beat.marker.labelKey ?? null, d);
      if (!zoneTriggered && d <= beat.marker.radius) {
        zoneTriggered = true;
        emitGameEvent("zone:enter", { id: beat.marker.id });
        return;
      }
    }
  }
  if (beat.timeoutMs && now - beatStartedAt > beat.timeoutMs) completeBeat();
}

function tickHintTimer(now: number): void {
  const cur = useOnboardingStore.getState().currentHint;
  if (!cur) {
    shownHintId = null;
    return;
  }
  if (cur.id !== shownHintId) {
    shownHintId = cur.id;
    hintShownAt = now;
  } else if (now - hintShownAt >= cur.durationMs) {
    useOnboardingStore.getState().dismissCurrentHint();
    shownHintId = null;
  }
}

/** update-phase system (order 0). Runs after the input probe (order -100). */
export function runnerSystem(_world?: unknown, dt: number = 0): void {
  const now = performance.now();
  maybeAutoStart();
  const store = useOnboardingStore.getState();

  if (store.phase === "firstRun") {
    const step = getStep(store.stepIndex);
    if (step && now - stepStartedAt > step.timeoutMs) advanceFirstRunStep();
  }

  if (store.phase === "intro" && missionScript) {
    const beat = missionScript.beats[store.beatIndex];
    if (beat?.enableVehicleKeyFallback && input.snapshot.justPressed.has(InputAction.EnterExitVehicle)) {
      emitGameEvent("player:vehicleKey");
    }
    markerAccum += dt;
    if (markerAccum >= MARKER_POLL_S) {
      markerAccum = 0;
      pollBeat(now);
    }
  }

  tickHintTimer(now);
}

// ── bus subscription (single wildcard handler routes to every consumer) ──────────
export function initController(): () => void {
  const onAny = (type: OnbEventKey, payload: OnbGameEvents[OnbEventKey]): void => {
    handleFirstRun(type, payload);
    handleMission(type);
    handleHints(type, payload);
  };
  bus.on("*", onAny);
  return () => bus.off("*", onAny);
}

// ── global Help hotkey (F1) ──────────────────────────────────────────────────────
export function installHelpHotkey(): () => void {
  if (typeof window === "undefined") return () => {};
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === "F1") {
      e.preventDefault();
      useOnboardingStore.getState().toggleHelp();
    }
  };
  window.addEventListener("keydown", onKey);
  return () => window.removeEventListener("keydown", onKey);
}

// ── public flow controls (used by the Help overlay + integrator) ─────────────────
export function replayOnboarding(): void {
  despawnAll();
  missionScript = null;
  useOnboardingStore.getState().resetProgress();
  useOnboardingStore.getState().closeHelp();
  startFirstRun();
}

export function skipOnboarding(): void {
  despawnAll();
  missionScript = null;
  useOnboardingStore.getState().markComplete();
  useOnboardingStore.getState().closeHelp();
}

/** Skip just the current first-run step (the card's "Skip step" affordance). */
export function skipCurrentStep(): void {
  if (useOnboardingStore.getState().phase === "firstRun") advanceFirstRunStep();
}
