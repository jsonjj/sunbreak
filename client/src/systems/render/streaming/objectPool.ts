// Generic warm object pool. Recycling peds / vehicles / bullets / collider descriptors instead
// of allocating them avoids GC spikes (a top cause of frame hitches in long browser sessions).
// The streaming subsystem exposes this so spawner systems can pull from warm pools and release
// on chunk unload rather than destroying.

export interface PoolStats {
  free: number;
  inUse: number;
  created: number;
  capacity: number;
}

export class ObjectPool<T> {
  private free: T[] = [];
  private created = 0;
  private inUse = 0;

  /**
   * @param make    Factory for a fresh instance (called on a cold miss).
   * @param reset   Cleanup applied on release before an item returns to the free list.
   * @param warm    Number of instances to pre-allocate up front.
   * @param capacity Optional hard cap on total live+free instances (0 = unbounded).
   */
  constructor(
    private readonly make: () => T,
    private readonly reset: (item: T) => void = () => {},
    warm = 0,
    private readonly capacity = 0,
  ) {
    for (let i = 0; i < warm; i++) {
      this.free.push(this.make());
      this.created++;
    }
  }

  /** Take a warm instance (or create one on a cold miss). Returns null only if capped out. */
  acquire(): T | null {
    const item = this.free.pop();
    if (item !== undefined) {
      this.inUse++;
      return item;
    }
    if (this.capacity > 0 && this.created >= this.capacity) return null;
    this.created++;
    this.inUse++;
    return this.make();
  }

  /** Return an instance to the pool for reuse (no GC). */
  release(item: T): void {
    this.reset(item);
    this.free.push(item);
    if (this.inUse > 0) this.inUse--;
  }

  /** Pre-grow the free list to at least `n` warm instances. */
  warmTo(n: number): void {
    while (this.free.length < n && (this.capacity === 0 || this.created < this.capacity)) {
      this.free.push(this.make());
      this.created++;
    }
  }

  /** Drop the free list (optionally disposing each). Live/acquired items are untouched. */
  clear(dispose?: (item: T) => void): void {
    if (dispose) for (const item of this.free) dispose(item);
    this.created -= this.free.length;
    this.free.length = 0;
  }

  get stats(): PoolStats {
    return {
      free: this.free.length,
      inUse: this.inUse,
      created: this.created,
      capacity: this.capacity,
    };
  }
}
