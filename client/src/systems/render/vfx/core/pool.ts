// Generic zero-GC object pool. Used for heavyweight recyclables (dynamic PointLights, hero
// particle systems) where allocation churn in the hot path would cause frame hitches.
// Particle data itself lives in preallocated typed arrays (see ../particles/*), not here.

export class Pool<T> {
  private free: T[] = [];
  private live = 0;

  constructor(
    private readonly make: () => T,
    private readonly reset: (t: T) => void,
    warm = 0,
    private readonly max = Infinity,
  ) {
    for (let i = 0; i < warm && i < max; i++) {
      this.free.push(make());
      this.live++;
    }
  }

  /** Reuse a freed instance, or allocate a fresh one until `max`. Returns null when capped. */
  acquire(): T | null {
    const reused = this.free.pop();
    if (reused !== undefined) return reused;
    if (this.live < this.max) {
      this.live++;
      return this.make();
    }
    return null;
  }

  /** Return an instance to the pool (reset first, so the free list holds clean objects). */
  release(t: T): void {
    this.reset(t);
    this.free.push(t);
  }

  /** Total instances ever created (live = in-use + free). */
  get size(): number {
    return this.live;
  }

  get available(): number {
    return this.free.length;
  }
}
