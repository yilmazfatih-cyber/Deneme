// AŞAMA 4 — Bileşenler ve güncelleme kuyruğu (nextTick).
// Her bileşen örneğinin render'ı bir ReactiveEffect'tir. Bağımlılığı değişince effect hemen çalışmaz; zamanlayıcısı
// işi kuyruğa koyar (queueJob). Kuyruk mikro görevde, id sırasıyla (ebeveyn önce) bir kez boşaltılır: aynı tick'teki
// on değişiklik tek render olur. nextTick, o boşaltma bittikten sonra çözülen sözdür (promise).
// Gerçek karşılıklar (packages/runtime-core/src/):
//   component.ts (createComponentInstance, setupComponent, handleSetupResult, registerRuntimeCompiler)
//   renderer.ts (mountComponent, setupRenderEffect → componentUpdateFn, updateComponent, unmountComponent)
//   componentRenderUtils.ts (renderComponentRoot, shouldUpdateComponent)   componentProps.ts   componentEmits.ts
//   scheduler.ts (queueJob, findInsertionIndex, flushJobs, nextTick)       apiLifecycle.ts (onMounted, onUnmounted)
//   componentPublicInstance.ts (RuntimeCompiledPublicInstanceProxyHandlers: `with` için has tuzağı)

import { ReactiveEffect, shallowReactive, proxyRefs, pauseTracking, resetTracking } from './asama1_reaktivite.js'
import { createRenderer, h } from './asama2_vnode_patch.js'
import { compile } from './asama3_derleyici.js'

// ------------------------------------------------------------------ zamanlayıcı

const kuyruk = []
let flushIndex = -1
let bekleyenTemizleme = null
const cozulmus = Promise.resolve()

/** DOM güncellendikten sonra çalış: await nextTick() ya da nextTick(fn). */
export function nextTick(fn) {
  const p = bekleyenTemizleme || cozulmus
  return fn ? p.then(fn) : p
}

export function queueJob(job) {
  if (job.kuyrukta) return // aynı iş bir kez: tekrar eden değişiklikler birleşir
  job.kuyrukta = true
  let i = kuyruk.length
  while (i > flushIndex + 1 && kuyruk[i - 1].id > job.id) i-- // id sırası: ebeveyn çocuktan önce
  kuyruk.splice(i, 0, job)
  if (!bekleyenTemizleme) bekleyenTemizleme = cozulmus.then(flushJobs)
}

// Vue ≤3.4'teki invalidateJob. 3.5 aynı sonucu farklı alır: kuyruğa konan iş `effect.runIfDirty`'dir; ebeveyn çocuğu
// senkron güncelledikten sonra effect artık kirli olmadığından kuyruktaki iş boş geçer (renderer.ts → setupRenderEffect).
function invalidateJob(job) {
  const i = kuyruk.indexOf(job)
  if (i > flushIndex) {
    kuyruk.splice(i, 1)
    job.kuyrukta = false
  }
}

function flushJobs() {
  try {
    for (flushIndex = 0; flushIndex < kuyruk.length; flushIndex++) {
      const job = kuyruk[flushIndex]
      job.kuyrukta = false
      job()
    }
  } finally {
    flushIndex = -1
    kuyruk.length = 0
    bekleyenTemizleme = null
  }
}

// ------------------------------------------------------------------ bileşen örneği

let uid = 0
let currentInstance = null

export function onMounted(fn) {
  currentInstance.mounted.push(fn)
}
export function onUnmounted(fn) {
  currentInstance.unmounted.push(fn)
}

function createComponentInstance(vnode, parent) {
  return {
    uid: uid++,
    vnode,
    type: vnode.type,
    parent,
    props: shallowReactive({}), // yalnız üst düzeyi reaktif: props.x değişince bağımlılar güncellenir
    setupState: {},
    ctx: null,
    render: null,
    subTree: null,
    isMounted: false,
    effect: null,
    update: null,
    next: null, // ebeveynden gelen yeni vnode (props güncellemesi bekliyor)
    cache: [], // derleyicinin statik vnode önbelleği (_cache)
    mounted: [],
    unmounted: [],
    emit: null,
  }
}

function propsGuncelle(instance, ham) {
  const props = instance.props
  const yeni = ham || {}
  for (const k of Object.keys(yeni)) if (k !== 'key' && props[k] !== yeni[k]) props[k] = yeni[k]
  for (const k of Object.keys(props)) if (!(k in yeni)) delete props[k]
}

function setupComponent(instance) {
  const Bilesen = instance.type
  propsGuncelle(instance, instance.vnode.props)
  instance.emit = (olay, ...args) => {
    const isleyici = instance.props['on' + olay[0].toUpperCase() + olay.slice(1)]
    if (isleyici) isleyici(...args)
  }
  currentInstance = instance
  try {
    const sonuc = Bilesen.setup ? Bilesen.setup(instance.props, { emit: instance.emit }) : undefined
    if (typeof sonuc === 'function') instance.render = sonuc
    else if (sonuc) instance.setupState = proxyRefs(sonuc) // şablonda .value yazmadan ref okumak için
  } finally {
    currentInstance = null
  }
  if (!instance.render) {
    if (Bilesen.render) instance.render = Bilesen.render
    else if (Bilesen.template) instance.render = Bilesen.__derlenmis ??= compile(Bilesen.template)
    else throw new Error('Bileşenin setup render fonksiyonu, render ya da template alanı olmalı')
  }
  // Şablonun gördüğü bağlam: önce setup durumu, sonra props. `with (_ctx)` için has tuzağı şart.
  const durum = () => instance.setupState
  instance.ctx = new Proxy(
    {},
    {
      has: (_, k) =>
        typeof k === 'string' && (k === '$emit' || (k[0] !== '_' && (k in durum() || k in instance.props))),
      get(_, k) {
        if (k === '$emit') return instance.emit
        if (k === '$bilesenler') return Bilesen.components || {}
        if (typeof k !== 'string') return undefined
        return k in durum() ? durum()[k] : instance.props[k]
      },
      set(_, k, deger) {
        if (k in durum()) {
          durum()[k] = deger
          return true
        }
        throw new Error(`"${String(k)}" setup durumunda yok; props salt okunurdur`)
      },
    },
  )
}

function renderComponentRoot(instance) {
  const agac = instance.render.call(instance.ctx, instance.ctx, instance.cache)
  if (!agac || !agac.__v_isVNode) throw new Error('render tek bir vnode döndürmeli')
  return agac
}

function mountComponent(vnode, container, anchor, parent, internals) {
  const instance = (vnode.component = createComponentInstance(vnode, parent))
  pauseTracking() // setup okumaları ebeveynin render effect'ine bağlanmasın
  try {
    setupComponent(instance)
  } finally {
    resetTracking()
  }
  setupRenderEffect(instance, container, anchor, internals)
}

function setupRenderEffect(instance, container, anchor, internals) {
  const componentUpdateFn = () => {
    if (!instance.isMounted) {
      const agac = (instance.subTree = renderComponentRoot(instance))
      internals.patch(null, agac, container, anchor, instance)
      instance.vnode.el = agac.el
      instance.isMounted = true
      instance.mounted.forEach((fn) => fn()) // çocukların mounted'ı ebeveyninkinden önce
      return
    }
    if (instance.next) {
      const yeni = instance.next
      yeni.el = instance.vnode.el
      instance.vnode = yeni
      instance.next = null
      pauseTracking()
      try {
        propsGuncelle(instance, yeni.props)
      } finally {
        resetTracking()
      }
    }
    const onceki = instance.subTree
    const agac = (instance.subTree = renderComponentRoot(instance))
    internals.patch(onceki, agac, internals.nodeOps.parentNode(onceki.el), internals.getNextHostNode(onceki), instance)
    instance.vnode.el = agac.el
  }
  const effect = (instance.effect = new ReactiveEffect(componentUpdateFn, () => queueJob(update)))
  const update = (instance.update = () => {
    if (effect.active) effect.run()
  })
  update.id = instance.uid
  update()
}

function propsDegisti(a, b) {
  const x = a || {}
  const y = b || {}
  const kx = Object.keys(x).filter((k) => k !== 'key')
  const ky = Object.keys(y).filter((k) => k !== 'key')
  return kx.length !== ky.length || ky.some((k) => x[k] !== y[k])
}

function updateComponent(n1, n2) {
  const instance = (n2.component = n1.component)
  if (propsDegisti(n1.props, n2.props)) {
    instance.next = n2
    invalidateJob(instance.update) // kuyrukta kendi işi varsa düşür: şimdi zaten güncelleniyor
    instance.update()
  } else {
    n2.el = n1.el
    instance.vnode = n2
  }
}

function unmountComponent(instance, doRemove, internals) {
  instance.effect.stop()
  invalidateJob(instance.update)
  internals.unmount(instance.subTree, doRemove)
  instance.unmounted.forEach((fn) => fn())
}

/** runtime-dom'un createApp'i gibi: nodeOps verilir, bileşen destekli renderer kurulur. */
export function createRendererWithComponents(nodeOps) {
  const renderer = createRenderer(nodeOps, {
    processComponent(n1, n2, container, anchor, parent, internals) {
      if (n1 === null) mountComponent(n2, container, anchor, parent, internals)
      else updateComponent(n1, n2)
    },
    unmountComponent,
  })
  return {
    render: renderer.render,
    createApp(KokBilesen, kokProps = null) {
      return {
        mount(container) {
          const vnode = h(KokBilesen, kokProps)
          renderer.render(vnode, container)
          return vnode.component
        },
      }
    },
  }
}
