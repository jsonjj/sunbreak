// System-registration contract. miniplex has no built-in scheduler, so we own system order.
// A system is a pure-ish function over the world for a given phase. Subsystems register into
// a SystemRegistry; the client runs phases in a deterministic order each frame.

export type SystemPhase =
  | "input" // sample devices -> entity.input
  | "prePhysics" // intent -> forces/kinematic moves (anchor to useBeforePhysicsStep)
  | "physics" // Rapier.step() (owned by <Physics>)
  | "postPhysics" // bodies -> entity.transform (anchor to useAfterPhysicsStep)
  | "update" // fixed-rate gameplay + per-frame view (camera, anim)
  | "render" // render / postprocessing
  | "finish"; // mirror selected sim values into Zustand for the HUD

export const SYSTEM_PHASES: readonly SystemPhase[] = [
  "input",
  "prePhysics",
  "physics",
  "postPhysics",
  "update",
  "render",
  "finish",
] as const;

export interface System<W = unknown> {
  readonly name: string;
  readonly phase: SystemPhase;
  /** Lower runs first within a phase. Default 0. */
  readonly order?: number;
  fn: (world: W, dt: number) => void;
}

/** A subsystem module packages its systems (and optional init side-effect) for registration. */
export interface SubsystemModule<W = unknown> {
  readonly id: string;
  readonly systems?: ReadonlyArray<System<W>>;
  /** Optional one-time init; may return a cleanup fn. */
  init?: () => void | (() => void);
}

const phaseIndex = (p: SystemPhase): number => SYSTEM_PHASES.indexOf(p);

/** Ordered registry of systems. Iterate with `run(phase, ...)` per frame. */
export class SystemRegistry<W = unknown> {
  private systems: Array<System<W>> = [];
  /** System names that have already thrown once — used to log a fault a single time. */
  private faulted = new Set<string>();

  register(system: System<W>): () => void {
    this.systems.push(system);
    this.sort();
    return () => this.unregister(system);
  }

  registerModule(mod: SubsystemModule<W>): () => void {
    const cleanups: Array<() => void> = [];
    const disposeInit = mod.init?.();
    if (typeof disposeInit === "function") cleanups.push(disposeInit);
    for (const s of mod.systems ?? []) cleanups.push(this.register(s));
    return () => {
      for (const c of cleanups) c();
    };
  }

  unregister(system: System<W>): void {
    const i = this.systems.indexOf(system);
    if (i >= 0) this.systems.splice(i, 1);
  }

  private sort(): void {
    this.systems.sort(
      (a, b) => phaseIndex(a.phase) - phaseIndex(b.phase) || (a.order ?? 0) - (b.order ?? 0),
    );
  }

  /** Run every system registered to `phase`, in order.
   *
   *  Each system is fault-isolated: a throw is caught, logged once (per system), and the loop
   *  moves on. This is critical on the client, where these phases are pumped from a single R3F
   *  `useFrame` — an uncaught throw there aborts the frame callback and R3F then SKIPS its
   *  automatic `gl.render()` for that frame (the loop only re-arms because it schedules the next
   *  rAF before running subscribers). One broken subsystem must never black out the whole
   *  renderer (or halt every other system) — it just sits out until it stops throwing. */
  run(phase: SystemPhase, world: W, dt: number): void {
    for (const s of this.systems) {
      if (s.phase !== phase) continue;
      try {
        s.fn(world, dt);
      } catch (err) {
        if (!this.faulted.has(s.name)) {
          this.faulted.add(s.name);
          console.error(
            `[systems] "${s.name}" threw during the "${phase}" phase; isolating it so the ` +
              `frame still renders (further errors from this system are suppressed):`,
            err,
          );
        }
      }
    }
  }

  get all(): ReadonlyArray<System<W>> {
    return this.systems;
  }
}
