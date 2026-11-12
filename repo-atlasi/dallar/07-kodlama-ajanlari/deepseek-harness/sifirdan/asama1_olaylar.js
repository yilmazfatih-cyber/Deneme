// Aşama 1 — Olay yolu (event bus) ve beş dağıtım kipi
//
// Cordis'te (deepseek-harness'ın altındaki eklenti çatısı, vendor/cordis/src/events.ts) bir olayın
// nasıl dağıtıldığı onun sözleşmesinin parçasıdır:
//   emit      → eşzamanlı yayın; dönüş değerleri ve promise'ler beklenmez
//               (Cordis'in emit'i dinleyici hatasını yakalamaz; mini her dinleyiciyi ayrı yalıtır, dsh de
//               session/event gibi gözlem olaylarında bunu kendisi yapar)
//   parallel  → tüm dinleyiciler aynı anda; biri hata verse de hepsi beklenir, hatalar sonra toplu fırlatılır
//   serial    → sırayla, beklenerek; ilk "boş olmayan" dönüş kazanır ve gerisi çalışmaz
//   bail      → serial'ın eşzamanlı hâli
//   waterfall → "etrafından saran ara katman": dinleyici (…argümanlar, next) alır; next() çağırmazsa
//               zinciri keser (veto), çağırırsa sonucu dönüştürebilir
// Bu dosya Cordis kodundan kopya değildir; aynı sözleşmeleri küçük ve bağımsız biçimde uygular.

/** "Boş" sayılan dönüşler: serial/bail bunları atlayıp sonraki dinleyiciye geçer. */
const isEmpty = (value) => value === undefined || value === null || value === false

export class EventBus {
  /** @param {{ onError?: (error: unknown, name: string) => void }} [options] */
  constructor(options = {}) {
    /** @type {Map<string, Array<{ fn: Function, prepend: boolean }>>} */
    this.listeners = new Map()
    this.onError = options.onError ?? ((error, name) => console.error(`[${name}] dinleyici hatası:`, error))
  }

  /**
   * Dinleyici ekler; kaldırmak için dönen fonksiyonu çağır.
   * `prepend: true` dinleyiciyi sıranın başına koyar (waterfall'da en dışta çalışır).
   */
  on(name, fn, { prepend = false } = {}) {
    const entry = { fn, prepend }
    const list = this.listeners.get(name) ?? []
    if (prepend) list.splice(list.filter((item) => item.prepend).length, 0, entry)
    else list.push(entry)
    this.listeners.set(name, list)
    return () => {
      const current = this.listeners.get(name) ?? []
      const index = current.indexOf(entry)
      if (index !== -1) current.splice(index, 1)
    }
  }

  /** Dağıtım anındaki listenin kopyası: dinleyici çalışırken liste değişse de tur bozulmaz. */
  snapshot(name) {
    return [...(this.listeners.get(name) ?? [])].map((entry) => entry.fn)
  }

  /** Eşzamanlı yayın. Bir gözlemcinin hatası diğerlerini durdurmaz; onError'a gider. */
  emit(name, ...args) {
    for (const fn of this.snapshot(name)) {
      try {
        const result = fn(...args)
        if (result && typeof result.then === 'function') result.then(undefined, (error) => this.onError(error, name))
      } catch (error) {
        this.onError(error, name)
      }
    }
  }

  /**
   * Hepsini aynı anda çalıştırır ve hepsini bekler. Promise.all ilk hatada beklemeyi bırakırdı;
   * allSettled herkesi bekler, hataları sonra tek bir AggregateError olarak fırlatır (Cordis'teki gibi).
   */
  async parallel(name, ...args) {
    const results = await Promise.allSettled(this.snapshot(name).map(async (fn) => fn(...args)))
    const errors = results.filter((result) => result.status === 'rejected').map((result) => result.reason)
    if (errors.length > 0) throw new AggregateError(errors, `${name}: ${errors.length} dinleyici hata verdi`)
  }

  /** Sırayla bekler; ilk boş olmayan sonuç döner. */
  async serial(name, ...args) {
    for (const fn of this.snapshot(name)) {
      const result = await fn(...args)
      if (!isEmpty(result)) return result
    }
    return undefined
  }

  /** serial'ın eşzamanlı kardeşi. */
  bail(name, ...args) {
    for (const fn of this.snapshot(name)) {
      const result = fn(...args)
      if (!isEmpty(result)) return result
    }
    return undefined
  }

  /**
   * Etrafından saran zincir. Son argüman, zincirin en içindeki varsayılan davranıştır.
   * Kayıt sırası dıştan içe doğrudur: ilk dinleyici en dışta çalışır.
   */
  async waterfall(name, ...argsAndNext) {
    const fallback = argsAndNext.pop()
    if (typeof fallback !== 'function') throw new TypeError('waterfall son argüman olarak next() ister')
    const chain = this.snapshot(name)
    const run = async (index) => {
      if (index >= chain.length) return fallback(...argsAndNext)
      let called = false
      const next = () => {
        if (called) throw new Error(`${name}: next() bir dinleyicide iki kez çağrılamaz`)
        called = true
        return run(index + 1)
      }
      return chain[index](...argsAndNext, next)
    }
    return run(0)
  }
}
