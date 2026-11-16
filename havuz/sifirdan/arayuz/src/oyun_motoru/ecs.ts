// Varlık-Bileşen-Sistem (ECS): varlık yalnız bir numaradır; veriler bileşen depolarında durur; davranış
// sistemlerdedir (dünyayı okuyup yazan düz işlevler). Kalıtım yerine birleşim: "zıplayabilen, çarpışan,
// toplanabilen" bir şey, ilgili bileşenler eklenerek kurulur.
// Silme ertelenir (`destroy` → `flush`): bir sistem varlıkları dolaşırken silmek döngüyü bozmaz.
// Depolar ekleme sırasını korur (Map): dolaşma sırası belirlenimcidir — tekrar oynatma için önemli.
// Genişletme: yeni bileşen = `defineComponent<Tür>('ad')`; yeni sistem = (world, dt) => void işlevi.

export type Entity = number

export interface ComponentType<T> {
  readonly id: number
  readonly name: string
  /** Yalnız tür taşır; çalışma anında kullanılmaz. */
  readonly __type?: T
}

let nextComponentId = 0

export function defineComponent<T>(name: string): ComponentType<T> {
  return { id: nextComponentId++, name }
}

export class World {
  private nextEntity = 1
  private readonly alive = new Set<Entity>()
  private readonly doomed = new Set<Entity>()
  private readonly stores = new Map<number, Map<Entity, unknown>>()

  create(): Entity {
    const entity = this.nextEntity++
    this.alive.add(entity)
    return entity
  }

  /** Silmeyi işaretler; asıl silme `flush()`'ta (karenin sonunda) yapılır. */
  destroy(entity: Entity): void {
    if (this.alive.has(entity)) this.doomed.add(entity)
  }

  flush(): void {
    for (const entity of this.doomed) {
      this.alive.delete(entity)
      for (const store of this.stores.values()) store.delete(entity)
    }
    this.doomed.clear()
  }

  isAlive(entity: Entity): boolean {
    return this.alive.has(entity) && !this.doomed.has(entity)
  }

  get count(): number {
    return this.alive.size
  }

  private store<T>(type: ComponentType<T>): Map<Entity, T> {
    let store = this.stores.get(type.id)
    if (!store) {
      store = new Map<Entity, unknown>()
      this.stores.set(type.id, store)
    }
    return store as Map<Entity, T>
  }

  add<T>(entity: Entity, type: ComponentType<T>, value: T): T {
    if (!this.alive.has(entity)) throw new Error(`Varlık ${entity} yok; önce world.create() ile oluşturun.`)
    this.store(type).set(entity, value)
    return value
  }

  get<T>(entity: Entity, type: ComponentType<T>): T | undefined {
    return this.store(type).get(entity)
  }

  /** Bileşen kesin olmalıysa: yoksa hangi bileşenin eksik olduğunu söyleyen hata atar. */
  need<T>(entity: Entity, type: ComponentType<T>): T {
    const value = this.store(type).get(entity)
    if (value === undefined) throw new Error(`Varlık ${entity} üzerinde "${type.name}" bileşeni yok.`)
    return value
  }

  has(entity: Entity, type: ComponentType<unknown>): boolean {
    return this.store(type).has(entity)
  }

  remove(entity: Entity, type: ComponentType<unknown>): void {
    this.store(type).delete(entity)
  }

  /** Tüm bileşenlere sahip, silinmek üzere olmayan varlıklar (en küçük depo dolaşılır). */
  query(...types: ComponentType<unknown>[]): Entity[] {
    if (types.length === 0) return [...this.alive].filter((e) => !this.doomed.has(e))
    const stores = types.map((t) => this.store(t)).sort((a, b) => a.size - b.size)
    const [smallest, ...rest] = stores as [Map<Entity, unknown>, ...Map<Entity, unknown>[]]
    const out: Entity[] = []
    for (const entity of smallest.keys())
      if (!this.doomed.has(entity) && rest.every((s) => s.has(entity))) out.push(entity)
    return out
  }
}
