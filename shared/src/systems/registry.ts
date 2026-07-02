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

  /** Run every system registered to `phase`, in order. */
  run(phase: SystemPhase, world: W, dt: number): void {
    for (const s of this.systems) if (s.phase === phase) s.fn(world, dt);
  }

  get all(): ReadonlyArray<System<W>> {
    return this.systems;
  }
}
