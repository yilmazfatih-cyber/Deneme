// Vue 2 reaktivitesinin mini hâli: Object.defineProperty + Dep/Watcher + dizi yöntemi yamalama + nextTick kuyruğu.
// Amaç Vue 3'ün Proxy yaklaşımıyla karşılaştırmak (test/karsilastirma.test.js). Gerçek karşılıklar (src/core/):
//   observer/index.ts (Observer, observe, defineReactive, set, del, dependArray)   observer/dep.ts (Dep, pushTarget)
//   observer/array.ts (arrayMethods, methodsToPatch)   observer/watcher.ts (get, addDep, cleanupDeps, update, depend)
//   observer/scheduler.ts (queueWatcher, flushSchedulerQueue)   util/next-tick.ts (Promise → MutationObserver → ...)
//   instance/state.ts (initData, initComputed, proxy)
// Vue 2.7'deki reactive() de (src/v3/reactivity/reactive.ts) aynı observe() fonksiyonunu çağırır: nesneyi yerinde değiştirir.

// ------------------------------------------------------------------ Dep: "bu değere kim bağlı?"

let depId = 0

export class Dep {
  constructor() {
    this.id = depId++
    this.subs = []
  }
  addSub(watcher) {
    this.subs.push(watcher)
  }
  removeSub(watcher) {
    const i = this.subs.indexOf(watcher)
    if (i >= 0) this.subs.splice(i, 1)
  }
  depend() {
    if (Dep.target) Dep.target.addDep(this)
  }
  notify() {
    for (const w of this.subs.slice().sort((a, b) => a.id - b.id)) w.update()
  }
}

/** Şu an değerlendirilen watcher (Vue 3'teki activeEffect). Yığın, iç içe watcher'lar için. */
Dep.target = null
const hedefYigini = []
export function pushTarget(w) {
  hedefYigini.push(w)
  Dep.target = w
}
export function popTarget() {
  hedefYigini.pop()
  Dep.target = hedefYigini[hedefYigini.length - 1] || null
}

// ------------------------------------------------------------------ dizi yöntemleri: prototip zincirine sızmak

const arrayProto = Array.prototype
export const arrayMethods = Object.create(arrayProto)
for (const yontem of ['push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse']) {
  const orijinal = arrayProto[yontem]
  Object.defineProperty(arrayMethods, yontem, {
    value: function (...args) {
      const sonuc = orijinal.apply(this, args)
      const ob = this.__ob__
      let eklenen = null
      if (yontem === 'push' || yontem === 'unshift') eklenen = args
      else if (yontem === 'splice') eklenen = args.slice(2)
      if (eklenen) ob.observeArray(eklenen) // yeni öğeler de gözlemlenmeli
      ob.dep.notify() // dizinin kendi Dep'i (indekslerin getter'ı yok!)
      return sonuc
    },
    enumerable: false,
    writable: true,
    configurable: true,
  })
}

// ------------------------------------------------------------------ Observer

const duzNesneMi = (v) => Object.prototype.toString.call(v) === '[object Object]'

export class Observer {
  constructor(value) {
    this.value = value
    this.dep = new Dep() // nesne/dizi düzeyinde: set/del ve dizi yöntemleri bunu tetikler
    this.vmCount = 0 // kök $data mı? (köke çalışma zamanında özellik eklenemez)
    Object.defineProperty(value, '__ob__', { value: this, enumerable: false, writable: true, configurable: true })
    if (Array.isArray(value)) {
      Object.setPrototypeOf(value, arrayMethods) // Vue 2: value.__proto__ = arrayMethods
      this.observeArray(value)
    } else {
      for (const key of Object.keys(value)) defineReactive(value, key) // HEPSİ şimdi, derinlemesine (hevesli)
    }
  }
  observeArray(items) {
    for (const item of items) observe(item)
  }
}

/** Yalnızca düz nesne ve dizileri gözlemler (Map, Set, Date... hayır). */
export function observe(value) {
  if (value === null || typeof value !== 'object') return undefined
  if (Object.prototype.hasOwnProperty.call(value, '__ob__')) return value.__ob__
  if ((Array.isArray(value) || duzNesneMi(value)) && Object.isExtensible(value)) return new Observer(value)
  return undefined
}

export function defineReactive(obj, key, val = obj[key]) {
  const dep = new Dep()
  const tanim = Object.getOwnPropertyDescriptor(obj, key)
  if (tanim && tanim.configurable === false) return
  let childOb = observe(val)
  Object.defineProperty(obj, key, {
    enumerable: true,
    configurable: true,
    get() {
      if (Dep.target) {
        dep.depend()
        if (childOb) {
          childOb.dep.depend() // Vue.set ve dizi yöntemleri bu Dep'i tetikler
          if (Array.isArray(val)) dependArray(val)
        }
      }
      return val
    },
    set(yeni) {
      if (yeni === val || (yeni !== yeni && val !== val)) return // aynı değer (NaN dahil)
      val = yeni
      childOb = observe(yeni)
      dep.notify()
    },
  })
}

function dependArray(dizi) {
  for (const e of dizi) {
    if (e && e.__ob__) e.__ob__.dep.depend()
    if (Array.isArray(e)) dependArray(e)
  }
}

/** Vue.set / this.$set: yeni özelliği reaktif ekler, diziye indeksle yazar (splice ile). */
export function set(target, key, val) {
  if (Array.isArray(target)) {
    target.length = Math.max(target.length, key)
    target.splice(key, 1, val)
    return val
  }
  if (key in target && !(key in Object.prototype)) {
    target[key] = val
    return val
  }
  const ob = target.__ob__
  if (ob && ob.vmCount > 0) {
    throw new Error('Kök $data nesnesine çalışma zamanında özellik eklenemez; data() içinde baştan tanımla.')
  }
  if (!ob) {
    target[key] = val
    return val
  }
  defineReactive(ob.value, key, val)
  ob.dep.notify()
  return val
}

/** Vue.delete / this.$delete */
export function del(target, key) {
  if (Array.isArray(target)) {
    target.splice(key, 1)
    return
  }
  if (!Object.prototype.hasOwnProperty.call(target, key)) return
  delete target[key]
  if (target.__ob__) target.__ob__.dep.notify()
}

// ------------------------------------------------------------------ Watcher + kuyruk

let watcherId = 0

export class Watcher {
  /**
   * @param {() => any} getter
   * @param {(yeni: any, eski: any) => void} cb
   * @param {{ lazy?: boolean, sync?: boolean }} [secenekler]  lazy: computed; sync: kuyruğa girmeden hemen
   */
  constructor(getter, cb = () => {}, { lazy = false, sync = false } = {}) {
    this.id = ++watcherId
    this.getter = getter
    this.cb = cb
    this.lazy = lazy
    this.sync = sync
    this.dirty = lazy
    this.deps = []
    this.newDeps = []
    this.depIds = new Set()
    this.newDepIds = new Set()
    this.value = lazy ? undefined : this.get()
  }
  get() {
    pushTarget(this)
    try {
      return this.getter()
    } finally {
      popTarget()
      this.cleanupDeps()
    }
  }
  addDep(dep) {
    if (this.newDepIds.has(dep.id)) return
    this.newDepIds.add(dep.id)
    this.newDeps.push(dep)
    if (!this.depIds.has(dep.id)) dep.addSub(this)
  }
  /** Bu çalışmada okunmayan eski bağımlılıklardan çık; yeni listeyi kalıcı yap (iki liste takası). */
  cleanupDeps() {
    for (const dep of this.deps) if (!this.newDepIds.has(dep.id)) dep.removeSub(this)
    ;[this.depIds, this.newDepIds] = [this.newDepIds, this.depIds]
    this.newDepIds.clear()
    ;[this.deps, this.newDeps] = [this.newDeps, this.deps]
    this.newDeps.length = 0
  }
  update() {
    if (this.lazy) this.dirty = true
    else if (this.sync) this.run()
    else queueWatcher(this)
  }
  run() {
    const eski = this.value
    this.value = this.get()
    if (this.value !== eski || (this.value !== null && typeof this.value === 'object')) this.cb(this.value, eski)
  }
  evaluate() {
    this.value = this.get()
    this.dirty = false
  }
  /** computed'ın bağımlılıklarını onu okuyan dış watcher'a (ör. render) aktarır. */
  depend() {
    for (const dep of this.deps) dep.depend()
  }
}

const kuyruk = []
const kuyruktakiler = new Set()
let bekliyor = false

export function queueWatcher(w) {
  if (kuyruktakiler.has(w.id)) return
  kuyruktakiler.add(w.id)
  kuyruk.push(w)
  if (!bekliyor) {
    bekliyor = true
    nextTick(flushSchedulerQueue)
  }
}

function flushSchedulerQueue() {
  kuyruk.sort((a, b) => a.id - b.id) // ebeveyn önce, kullanıcı watcher'ları render'dan önce
  for (let i = 0; i < kuyruk.length; i++) {
    kuyruktakiler.delete(kuyruk[i].id)
    kuyruk[i].run()
  }
  kuyruk.length = 0
  bekliyor = false
}

const geriCagrilar = []
let beklemede = false
/** Vue 2.6+: Promise.then; yoksa MutationObserver, setImmediate, en son setTimeout. Mini yalnızca Promise kullanır. */
export function nextTick(fn) {
  return new Promise((coz) => {
    geriCagrilar.push(() => {
      if (fn) fn()
      coz()
    })
    if (!beklemede) {
      beklemede = true
      Promise.resolve().then(() => {
        beklemede = false
        const kopya = geriCagrilar.splice(0)
        for (const g of kopya) g()
      })
    }
  })
}

// ------------------------------------------------------------------ mini Vue örneği

/**
 * new Vue({ data, computed, render }) özeti. render(vm) dize döndürür; sonuç vm.$el'e yazılır.
 * @param {{ data?: () => object, computed?: Record<string, () => any>, render: (vm: any) => string }} secenekler
 */
export function yeniVue(secenekler) {
  const vm = { $sayac: { render: 0 } }
  const data = (vm._data = secenekler.data ? secenekler.data() : {})
  for (const key of Object.keys(data)) {
    // vm.ad → vm._data.ad vekâleti (instance/state.ts → proxy)
    Object.defineProperty(vm, key, {
      get: () => data[key],
      set: (v) => {
        data[key] = v
      },
      enumerable: true,
    })
  }
  const ob = observe(data)
  ob.vmCount++
  for (const [ad, getter] of Object.entries(secenekler.computed || {})) {
    const w = new Watcher(
      () => getter.call(vm, vm),
      () => {},
      { lazy: true },
    )
    Object.defineProperty(vm, ad, {
      get() {
        if (w.dirty) w.evaluate() // tembel: yalnızca kirliyse yeniden hesapla
        if (Dep.target) w.depend() // okuyan watcher, computed'ın bağımlılıklarına abone olur
        return w.value
      },
    })
  }
  vm.$set = set
  vm.$delete = del
  vm.$nextTick = nextTick
  vm._renderWatcher = new Watcher(() => {
    vm.$sayac.render++
    vm.$el = secenekler.render(vm)
  })
  return vm
}
