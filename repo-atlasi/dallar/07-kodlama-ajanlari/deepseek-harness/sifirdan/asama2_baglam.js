// Aşama 2 — Bağlam (Context), eklenti (plugin), servis, inject ve etkiler (effects)
//
// Cordis'in beş fikri (docs/cordis-primer.md):
//   1. Eklenti bir fonksiyondur, `apply` alanı olan bir nesnedir ya da bir Service sınıfıdır.
//   2. Bağlam bir servis deposudur: `ctx.tools`, `ctx.llm` gibi anahtarlarla erişilir.
//   3. `inject` ile bağımlılık bildirilir; servisler gelene kadar eklenti PENDING bekler.
//   4. Olaylar tiplidir ve beş kipten biriyle dağıtılır (aşama 1).
//   5. Kayıtlar geri alınabilir etkilerdir: eklenti kalkınca hepsi ters sırada geri sarılır.
// Her yüklenmiş eklenti örneğinin bir "fiber"i vardır:
//   PENDING → LOADING → ACTIVE → UNLOADING → DISPOSED   (hata: FAILED)
// Bir servis kaybolursa ona bağımlı fiber'lar boşaltılıp PENDING'e döner; servis dönünce yeniden yüklenir.
// Kaynak karşılığı: vendor/cordis/src/{context,fiber,registry,service}.ts. Bu dosya bağımsız yazıldı.

import { EventBus } from './asama1_olaylar.js'

export const State = Object.freeze({
  PENDING: 'pending',
  LOADING: 'loading',
  ACTIVE: 'active',
  UNLOADING: 'unloading',
  DISPOSED: 'disposed',
  FAILED: 'failed',
})

/** Servis sınıflarının tabanı: kurucu, örneği verilen adla bağlama kaydeder. */
export class Service {
  constructor(ctx, name) {
    this.ctx = ctx
    ctx.provide(name, this)
  }
}

const isServiceClass = (plugin) => typeof plugin === 'function' && plugin.prototype instanceof Service

function describe(plugin) {
  if (typeof plugin === 'function') {
    return { name: plugin.pluginName ?? plugin.name ?? 'anonim', inject: plugin.inject ?? [], schema: plugin.schema }
  }
  if (plugin && typeof plugin.apply === 'function') {
    return { name: plugin.name ?? 'anonim', inject: plugin.inject ?? [], schema: plugin.schema }
  }
  throw new TypeError('Eklenti bir fonksiyon, apply alanlı bir nesne ya da Service sınıfı olmalı')
}

/** Bir eklenti örneğinin çalışma zamanı tutamağı. */
export class Fiber {
  constructor(app, parent, plugin, config) {
    this.app = app
    this.parent = parent
    this.plugin = plugin
    this.rawConfig = config
    this.meta = plugin ? describe(plugin) : { name: 'root', inject: [] }
    this.state = State.PENDING
    this.disposables = [] // etkilerin geri alma fonksiyonları, kayıt sırasıyla
    this.children = new Set()
    this.error = undefined
    this.ctx = createContext(this)
  }

  get name() {
    return this.meta.name
  }

  /** Tüm `inject` servisleri hazır mı? */
  ready() {
    return this.meta.inject.every((name) => this.app.services.has(name))
  }

  setState(state) {
    this.state = state
    this.app.bus.emit('internal/state', this, state)
  }

  /** Eklentinin apply'ını çalıştırır; hata olursa o ana kadarki etkileri geri sarar. */
  load() {
    this.setState(State.LOADING)
    try {
      this.config = this.meta.schema ? this.meta.schema(this.rawConfig ?? {}) : (this.rawConfig ?? {})
      if (isServiceClass(this.plugin)) this.instance = new this.plugin(this.ctx, this.config)
      else if (typeof this.plugin === 'function') this.plugin(this.ctx, this.config)
      else this.plugin.apply(this.ctx, this.config)
      this.setState(State.ACTIVE)
    } catch (error) {
      this.error = error
      this.runDisposers()
      this.setState(State.FAILED)
      this.app.bus.onError(error, `plugin:${this.name}`)
    }
  }

  /** Etkileri ters sırada çalıştırır; async temizlikleri toplayıp döndürür. */
  runDisposers() {
    const pending = []
    for (const child of [...this.children]) pending.push(child.dispose())
    while (this.disposables.length > 0) {
      const dispose = this.disposables.pop()
      try {
        const result = dispose()
        if (result && typeof result.then === 'function') pending.push(result)
      } catch (error) {
        this.app.bus.onError(error, `dispose:${this.name}`)
      }
    }
    return Promise.all(pending)
  }

  /** Bağımlılık kaybolunca: etkileri geri sar, PENDING'e dön (fiber yaşamaya devam eder). */
  unload() {
    if (this.state !== State.ACTIVE) return Promise.resolve()
    this.setState(State.UNLOADING)
    const done = this.runDisposers()
    this.setState(State.PENDING)
    return done
  }

  /** Eklentiyi tamamen kaldırır; çocuk eklentiler de gider. */
  dispose() {
    if (this.state === State.DISPOSED) return Promise.resolve()
    this.setState(State.UNLOADING)
    const done = this.runDisposers()
    this.parent?.children.delete(this)
    this.app.fibers.delete(this)
    this.setState(State.DISPOSED)
    this.app.refresh()
    return done
  }
}

/**
 * Fiber'a bağlı bağlam. Bilinmeyen özellik okumaları servis aramasına dönüşür: `ctx.tools`.
 * Bağlam üzerinden yapılan her kayıt bu fiber'ın etkisi olur.
 */
function createContext(fiber) {
  const app = fiber.app
  const methods = {
    fiber,
    app,
    get: (name) => app.services.get(name)?.value,
    /** Çocuk eklenti bağlar; ebeveyn kalkınca çocuk da kalkar. */
    plugin(plugin, config) {
      const child = new Fiber(app, fiber, plugin, config)
      fiber.children.add(child)
      app.fibers.add(child)
      app.refresh()
      return child
    },
    /** `setup` hemen çalışır; dönen fonksiyon, eklenti kalkınca çağrılır. */
    effect(setup) {
      if (fiber.state !== State.LOADING && fiber.state !== State.ACTIVE) {
        throw new Error(`${fiber.name}: ${fiber.state} durumunda yeni etki eklenemez`)
      }
      const dispose = setup() ?? (() => {})
      let disposed = false
      const wrapped = () => {
        if (disposed) return undefined
        disposed = true
        return dispose()
      }
      fiber.disposables.push(wrapped)
      return () => {
        const index = fiber.disposables.indexOf(wrapped)
        if (index !== -1) fiber.disposables.splice(index, 1)
        return wrapped()
      }
    },
    /** Servis kaydı da bir etkidir: sağlayıcı kalkınca servis kaybolur, bağımlılar boşaltılır. */
    provide(name, value) {
      return methods.effect(() => {
        if (app.services.has(name)) throw new Error(`"${name}" servisi zaten sağlanıyor`)
        app.services.set(name, { value, fiber })
        app.bus.emit('internal/service', name, true)
        app.refresh()
        return () => {
          app.services.delete(name)
          app.bus.emit('internal/service', name, false)
          return Promise.all(
            [...app.fibers]
              .filter((other) => other.state === State.ACTIVE && other.meta.inject.includes(name))
              .map((other) => other.unload()),
          )
        }
      })
    },
    on: (name, fn, options) => methods.effect(() => app.bus.on(name, fn, options)),
    emit: (name, ...args) => app.bus.emit(name, ...args),
    parallel: (name, ...args) => app.bus.parallel(name, ...args),
    serial: (name, ...args) => app.bus.serial(name, ...args),
    bail: (name, ...args) => app.bus.bail(name, ...args),
    waterfall: (name, ...args) => app.bus.waterfall(name, ...args),
  }
  return new Proxy(methods, {
    get(target, property) {
      if (property in target) return target[property]
      if (typeof property === 'string') return app.services.get(property)?.value
      return undefined
    },
    set() {
      throw new Error('Bağlama doğrudan yazılamaz; servis için ctx.provide(ad, değer) kullan')
    },
  })
}

/** Uygulama kökü: servis deposu, olay yolu ve fiber'lar. */
export class App {
  constructor(options = {}) {
    this.bus = new EventBus(options)
    this.services = new Map()
    this.fibers = new Set()
    this.refreshing = false
    this.dirty = false
    this.root = new Fiber(this, null, null, {})
    this.root.state = State.ACTIVE
  }

  get ctx() {
    return this.root.ctx
  }

  /** Bağımlılıkları hazır olan PENDING fiber'ları oluşturulma sırasıyla yükler. */
  refresh() {
    if (this.refreshing) {
      this.dirty = true
      return
    }
    this.refreshing = true
    try {
      do {
        this.dirty = false
        for (const fiber of [...this.fibers]) {
          if (fiber.state === State.PENDING && fiber.ready()) fiber.load()
        }
      } while (this.dirty)
    } finally {
      this.refreshing = false
    }
  }

  /** Teşhis: hangi eklenti neyi bekliyor? (Cordis'te "neden yüklenmedi" sorusunun cevabı) */
  report() {
    return [...this.fibers].map((fiber) => ({
      name: fiber.name,
      state: fiber.state,
      missing: fiber.meta.inject.filter((name) => !this.services.has(name)),
    }))
  }
}
