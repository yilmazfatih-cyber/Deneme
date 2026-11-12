// AŞAMA 1 — Proxy tabanlı reaktivite: reactive, ref, computed, effect; track/trigger; bağımlılık temizliği.
// Çekirdek fikir: bir effect çalışırken okuduğu her (nesne, anahtar) çifti "bu effect'e bağımlı" diye kaydedilir
// (track). O anahtara yazılınca kayıtlı effect'ler yeniden çalışır ya da zamanlayıcıya verilir (trigger).
// Gerçek karşılıklar (packages/reactivity/src/):
//   reactive.ts (reactive, toRaw, reactiveMap)   baseHandlers.ts (get/set/has/ownKeys/deleteProperty tuzakları)
//   dep.ts (track, trigger, targetMap, ITERATE_KEY) effect.ts (ReactiveEffect, effect, stop, pauseTracking)
//   ref.ts (RefImpl, proxyRefs)                    computed.ts (ComputedRefImpl)  arrayInstrumentations.ts
// Mini farkı: bağımlılık kümesi düz Set; Vue 3.5 bunun yerine çift yönlü bağlı liste (Link) ve sürüm sayacı kullanır.

/** Yalnızca yineleme (for...in, Object.keys) yapan effect'leri bağlamak için özel anahtar. */
export const ITERATE_KEY = Symbol('iterate')
const RAW = Symbol('raw')
const IS_REACTIVE = Symbol('isReactive')

// hedef → (anahtar → effect kümesi)
const targetMap = new WeakMap()
let activeEffect = null
let shouldTrack = true

export class ReactiveEffect {
  /**
   * @param {() => any} fn
   * @param {(() => void) | null} scheduler  verilirse trigger effect'i doğrudan çalıştırmaz, bunu çağırır
   */
  constructor(fn, scheduler = null) {
    this.fn = fn
    this.scheduler = scheduler
    this.deps = [] // bu effect'in kayıtlı olduğu kümeler (temizlik için)
    this.active = true
  }

  run() {
    if (!this.active) return this.fn()
    const onceki = activeEffect
    const oncekiIzleme = shouldTrack
    try {
      activeEffect = this
      shouldTrack = true // izleme duraklatılmışken (ör. push içinde) tetiklense bile kendi bağımlılıklarını kurmalı
      cleanupEffect(this) // eski bağımlılıkları sök: bu çalışmada okunmayanlar artık tetiklemesin
      return this.fn()
    } finally {
      activeEffect = onceki
      shouldTrack = oncekiIzleme
    }
  }

  stop() {
    if (this.active) {
      cleanupEffect(this)
      this.active = false
    }
  }
}

function cleanupEffect(effect) {
  for (const dep of effect.deps) dep.delete(effect)
  effect.deps.length = 0
}

/** effect(fn): hemen çalıştırır, okunan her şeye abone olur. Dönen runner ile elle de çalıştırılabilir. */
export function effect(fn, { scheduler = null, lazy = false } = {}) {
  const e = new ReactiveEffect(fn, scheduler)
  if (!lazy) e.run()
  const runner = e.run.bind(e)
  runner.effect = e
  return runner
}

export function stop(runner) {
  runner.effect.stop()
}

// İç içe duraklatmalar (ör. setup içinde push) bir öncekini bozmasın diye yığın tutulur (effect.ts'teki trackStack).
const izlemeYigini = []
export function pauseTracking() {
  izlemeYigini.push(shouldTrack)
  shouldTrack = false
}
export function resetTracking() {
  shouldTrack = izlemeYigini.length > 0 ? izlemeYigini.pop() : true
}

export function track(target, key) {
  if (activeEffect === null || !shouldTrack) return
  let depsMap = targetMap.get(target)
  if (!depsMap) targetMap.set(target, (depsMap = new Map()))
  let dep = depsMap.get(key)
  if (!dep) depsMap.set(key, (dep = new Set()))
  trackEffects(dep)
}

export function trackEffects(dep) {
  if (activeEffect === null || !shouldTrack || dep.has(activeEffect)) return
  dep.add(activeEffect)
  activeEffect.deps.push(dep)
}

/** @param {'set' | 'add' | 'delete'} tur */
export function trigger(target, tur, key, yeniDeger) {
  const depsMap = targetMap.get(target)
  if (!depsMap) return
  const kumeler = [depsMap.get(key)]
  if (tur === 'add' || tur === 'delete') {
    // Anahtar sayısı değişti: yineleyen effect'ler (Object.keys, for...in) ya da dizi uzunluğuna bakanlar.
    kumeler.push(depsMap.get(Array.isArray(target) ? 'length' : ITERATE_KEY))
  }
  if (Array.isArray(target) && key === 'length') {
    // arr.length = 1 gibi kısaltma: silinen indeksleri okuyan effect'ler de etkilenir.
    depsMap.forEach((dep, k) => {
      if (typeof k === 'string' && k !== 'length' && Number(k) >= yeniDeger) kumeler.push(dep)
    })
  }
  triggerEffects(kumeler)
}

export function triggerEffects(kumeler) {
  // Kopya şart: çalışan effect kendini kümeden silip yeniden ekler; canlı Set üzerinde gezmek sonsuz döngüdür.
  const calisacak = new Set()
  for (const dep of kumeler) if (dep) for (const e of dep) calisacak.add(e)
  for (const e of calisacak) {
    if (e === activeEffect) continue // kendi içinden kendini tetikleme (count++ sonsuz döngü olmasın)
    if (e.scheduler) e.scheduler()
    else e.run()
  }
}

// ------------------------------------------------------------------ reactive

const isObject = (v) => v !== null && typeof v === 'object'
const isIntegerKey = (k) => typeof k === 'string' && k !== 'NaN' && String(Number.parseInt(k, 10)) === k
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k)

// Dizi değiştiren yöntemler length'i hem okur hem yazar; izleme açık kalırsa iki effect birbirini sonsuza dek tetikler.
const diziYontemleri = {}
for (const ad of ['push', 'pop', 'shift', 'unshift', 'splice']) {
  diziYontemleri[ad] = function (...args) {
    pauseTracking()
    try {
      return Array.prototype[ad].apply(this, args)
    } finally {
      resetTracking()
    }
  }
}

function createHandlers(sig) {
  return {
    get(target, key, receiver) {
      if (key === RAW) return target
      if (key === IS_REACTIVE) return true
      if (Array.isArray(target) && hasOwn(diziYontemleri, key)) return diziYontemleri[key]
      const sonuc = Reflect.get(target, key, receiver)
      if (typeof key === 'symbol') return sonuc // Symbol.iterator vb. izlenmez
      track(target, key)
      if (sig) return sonuc
      if (isRef(sonuc)) return Array.isArray(target) && isIntegerKey(key) ? sonuc : sonuc.value // ref açma
      return isObject(sonuc) ? reactive(sonuc) : sonuc // tembel derinlik: iç nesne okunduğunda sarılır
    },
    set(target, key, deger, receiver) {
      const eski = target[key]
      const vardi = Array.isArray(target) && isIntegerKey(key) ? Number(key) < target.length : hasOwn(target, key)
      if (!sig) {
        deger = toRaw(deger)
        if (isRef(eski) && !isRef(deger) && !Array.isArray(target)) {
          eski.value = deger // state.sayac = 5 → içteki ref'e yazılır
          return true
        }
      }
      const sonuc = Reflect.set(target, key, deger, receiver)
      if (target === toRaw(receiver)) {
        if (!vardi) trigger(target, 'add', key, deger)
        else if (!Object.is(deger, eski)) trigger(target, 'set', key, deger)
      }
      return sonuc
    },
    deleteProperty(target, key) {
      const vardi = hasOwn(target, key)
      const sonuc = Reflect.deleteProperty(target, key)
      if (vardi && sonuc) trigger(target, 'delete', key)
      return sonuc
    },
    has(target, key) {
      const sonuc = Reflect.has(target, key)
      if (typeof key !== 'symbol') track(target, key)
      return sonuc
    },
    ownKeys(target) {
      track(target, Array.isArray(target) ? 'length' : ITERATE_KEY)
      return Reflect.ownKeys(target)
    },
  }
}

const derinHandlers = createHandlers(false)
const sigHandlers = createHandlers(true)
const reactiveMap = new WeakMap()
const shallowMap = new WeakMap()

function createReactive(target, handlers, onbellek) {
  if (!isObject(target)) return target
  if (target[IS_REACTIVE]) return target // zaten proxy
  const var_ = onbellek.get(target)
  if (var_) return var_ // aynı ham nesne → aynı proxy (kimlik korunur)
  const proxy = new Proxy(target, handlers)
  onbellek.set(target, proxy)
  return proxy
}

export const reactive = (target) => createReactive(target, derinHandlers, reactiveMap)
export const shallowReactive = (target) => createReactive(target, sigHandlers, shallowMap)
export const isReactive = (v) => isObject(v) && v[IS_REACTIVE] === true
export function toRaw(v) {
  const raw = isObject(v) ? v[RAW] : undefined
  return raw ? toRaw(raw) : v
}
const toReactive = (v) => (isObject(v) ? reactive(v) : v)

// ------------------------------------------------------------------ ref ve computed

class RefImpl {
  constructor(deger) {
    this.__v_isRef = true
    this.dep = new Set()
    this._ham = toRaw(deger)
    this._deger = toReactive(deger)
  }
  get value() {
    trackEffects(this.dep)
    return this._deger
  }
  set value(yeni) {
    const ham = toRaw(yeni)
    if (Object.is(ham, this._ham)) return
    this._ham = ham
    this._deger = toReactive(yeni)
    triggerEffects([this.dep])
  }
}

export const isRef = (r) => isObject(r) && r.__v_isRef === true
export const ref = (deger) => (isRef(deger) ? deger : new RefImpl(deger))
export const unref = (r) => (isRef(r) ? r.value : r)

/** Şablonda `sayac.value` yerine `sayac` yazabilmek için: okurken ref'i açar, yazarken .value'ya yazar. */
export function proxyRefs(nesne) {
  return new Proxy(nesne, {
    get: (t, k, r) => unref(Reflect.get(t, k, r)),
    set(t, k, deger, r) {
      if (isRef(t[k]) && !isRef(deger)) {
        t[k].value = deger
        return true
      }
      return Reflect.set(t, k, deger, r)
    },
  })
}

class ComputedRefImpl {
  constructor(getter) {
    this.__v_isRef = true
    this.dep = new Set()
    this._kirli = true // tembel: değer ancak okununca ve bağımlılık değiştiyse yeniden hesaplanır
    this.effect = new ReactiveEffect(getter, () => {
      if (!this._kirli) {
        this._kirli = true
        triggerEffects([this.dep]) // bana bağlı olanlara haber ver (onlar okuyunca hesaplarım)
      }
    })
  }
  get value() {
    trackEffects(this.dep)
    if (this._kirli) {
      this._kirli = false
      this._deger = this.effect.run()
    }
    return this._deger
  }
}

export const computed = (getter) => new ComputedRefImpl(getter)
