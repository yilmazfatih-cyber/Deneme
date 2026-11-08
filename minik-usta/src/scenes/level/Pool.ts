/**
 * Object pool (docs/TECH_DESIGN.md §10.4): `prewarm` at scene creation, `acquire` / `release` while playing, so the
 * hot paths and level changes allocate nothing (PieceView: 48 ready). Pure: the factory and the reset hook do the work.
 */
export class Pool<T> {
  private readonly free: T[] = [];
  private readonly create: () => T;
  private readonly onRelease: (item: T) => void;
  private created = 0;

  constructor(create: () => T, onRelease: (item: T) => void = () => undefined) {
    this.create = create;
    this.onRelease = onRelease;
  }

  /** Creates items until `count` are free. */
  prewarm(count: number): this {
    while (this.free.length < count) {
      this.free.push(this.create());
      this.created += 1;
    }
    return this;
  }

  acquire(): T {
    const item = this.free.pop();
    if (item !== undefined) return item;
    this.created += 1;
    return this.create();
  }

  release(item: T): void {
    this.onRelease(item);
    this.free.push(item);
  }

  /** Items waiting in the pool. */
  get available(): number {
    return this.free.length;
  }

  /** Items ever created (prewarm + misses). */
  get size(): number {
    return this.created;
  }
}
