// AŞAMA 3 — Fiber ağacı, bölünebilir iş döngüsü (time slicing) ve commit aşaması.
// Neden? Aşama 2 özyinelemeliydi: büyük bir ağaçta yarıda kesilemez, ana iş parçacığını kilitler.
// Fiber, özyinelemeyi bir bağlı liste yürüyüşüne çevirir (child / sibling / return). Böylece iş "birim birim"
// yapılır, zaman dolunca durulur, sonra kalınan yerden devam edilir. Ekrana dokunan her şey en sonda,
// tek ve kesintisiz commit aşamasında olur.
// Gerçek karşılıklar (packages/react-reconciler/src/):
//   ReactFiber.js (FiberNode, createWorkInProgress)        ReactFiberWorkLoop.js (performUnitOfWork, workLoop*)
//   ReactFiberBeginWork.js (beginWork)                     ReactFiberCompleteWork.js (completeWork, appendAllChildren)
//   ReactChildFiber.js (reconcileChildrenArray, placeChild) ReactFiberCommitWork.js + ReactFiberCommitHostEffects.js
//   ReactFiberRootScheduler.js (ensureRootIsScheduled, mikro görevde toplu işleme)

import { METIN, normalizeChildren, shallowEqualProps } from './eleman.js'
import { createScheduler } from './zamanlayici.js'

// İş etiketleri: ReactWorkTags.js'teki sayılarla aynı.
export const FunctionComponent = 0
export const HostRoot = 3
export const HostComponent = 5
export const HostText = 6

// Yan etki bayrakları: ReactFiberFlags.js'teki bitlerle aynı.
export const NoFlags = 0
export const Placement = 0b10
export const Update = 0b100
export const ChildDeletion = 0b10000

function createFiber(tag, type, key, pendingProps) {
  return {
    tag,
    type,
    key,
    pendingProps,
    memoizedProps: null,
    memoizedState: null, // fonksiyon bileşende hook listesi (Aşama 4)
    stateNode: null, // host düğümü; HostRoot için kök nesnesi
    return: null,
    child: null,
    sibling: null,
    index: 0,
    alternate: null, // bu fiber'ın ekrandaki (current) karşılığı
    flags: NoFlags,
    subtreeFlags: NoFlags,
    deletions: null,
  }
}

function createFiberFromElement(el) {
  if (el.type === METIN) return createFiber(HostText, METIN, el.key, el.props)
  const tag = typeof el.type === 'function' ? FunctionComponent : HostComponent
  return createFiber(tag, el.type, el.key, el.props)
}

// React iki ağacı (current / workInProgress) dönüşümlü kullanır ve alternate'i yeniden kullanır.
// Mini her render'da yeni fiber üretir; alternate yalnızca bu render boyunca "eski hâl" bağlantısıdır.
function createWorkInProgress(current, pendingProps) {
  const wip = createFiber(current.tag, current.type, current.key, pendingProps)
  wip.stateNode = current.stateNode
  wip.memoizedProps = current.memoizedProps
  wip.memoizedState = current.memoizedState
  wip.index = current.index
  wip.alternate = current
  return wip
}

/**
 * @param {object} container  host kapsayıcısı
 * @param {{ host: object, scheduler?: object, hooks?: object }} secenekler
 *   hooks: Aşama 4'ün taktığı eklenti (render öncesi/sonrası, commit sonrası, söküm haberleri)
 */
export function createRoot(container, { host, scheduler = createScheduler({ otomatik: true }), hooks = null }) {
  const root = {
    containerInfo: container,
    host,
    scheduler,
    hooks,
    current: null,
    bekleyenEleman: undefined, // render(el) ile gelmiş, henüz commit edilmemiş eleman
    islenenEleman: undefined,
    isVar: false, // işlenmemiş güncelleme var mı?
    yenidenBasla: false, // yarım kalan render çöpe atılıp baştan mı başlanmalı?
    wipKok: null, // yapım aşamasındaki HostRoot fiber'ı
    wip: null, // sıradaki iş birimi (React: workInProgress)
    gorev: null, // zamanlayıcıdaki görev
    mikrogorevVar: false,
    renderEdilenBilesenler: [], // bu render'da tamamlanan fonksiyon bileşen fiber'ları (önce çocuklar)
    istatistik: { dilim: 0, commit: 0, birim: 0 },
  }
  const kokFiber = createFiber(HostRoot, null, null, { element: null })
  kokFiber.stateNode = root
  kokFiber.memoizedProps = { element: null }
  root.current = kokFiber

  return {
    /** Eşzamanlı (concurrent) render: zamanlayıcı görevine bölünür, araya giren güncelleme işi yeniden başlatır. */
    render(element) {
      root.bekleyenEleman = element
      scheduleConcurrentWork(root)
    },
    /** Senkron render: workLoopSync gibi hiç durmadan bitirir (React: flushSync). */
    renderSync(element) {
      root.bekleyenEleman = element
      root.isVar = true
      performSyncWorkOnRoot(root)
    },
    unmount() {
      root.bekleyenEleman = null
      root.isVar = true
      performSyncWorkOnRoot(root)
    },
    _root: root,
  }
}

/** Eşzamanlı yol: zamanlayıcıya bir görev bırak. Render sürerken gelen güncelleme işi baştan başlatır. */
export function scheduleConcurrentWork(root) {
  root.isVar = true
  if (root.wip !== null) root.yenidenBasla = true
  if (root.gorev === null) root.gorev = root.scheduler.scheduleCallback(() => performConcurrentWorkOnRoot(root))
}

/**
 * Hook güncellemelerinin yolu: aynı tick'teki tüm setState'ler tek mikro görevde, tek render'da işlenir.
 * React 18+ "otomatik toplu işleme" (automatic batching): ReactFiberRootScheduler.js → processRootScheduleInMicrotask
 */
export function ensureRootIsScheduled(root) {
  root.isVar = true
  if (root.wip !== null) root.yenidenBasla = true
  if (root.mikrogorevVar) return
  root.mikrogorevVar = true
  queueMicrotask(() => {
    root.mikrogorevVar = false
    performSyncWorkOnRoot(root)
  })
}

function performConcurrentWorkOnRoot(root) {
  if (root.wip === null && !root.isVar) {
    root.gorev = null
    return null
  }
  if (root.wip === null || root.yenidenBasla) prepareFreshStack(root)
  root.istatistik.dilim++
  // workLoopConcurrentByScheduler: her birimden sonra "süre doldu mu?" diye sor.
  while (root.wip !== null && !root.scheduler.shouldYield()) performUnitOfWork(root, root.wip)
  if (root.wip !== null) return () => performConcurrentWorkOnRoot(root) // süre doldu: devam görevi
  root.gorev = null
  commitRoot(root)
  return null
}

export function performSyncWorkOnRoot(root) {
  root.hooks?.isOncesi?.(root) // bekleyen pasif efektler önce (React: flushPendingEffects)
  if (!root.isVar) return
  prepareFreshStack(root) // varsa yarım kalmış eşzamanlı işi çöpe at
  try {
    while (root.wip !== null) performUnitOfWork(root, root.wip) // workLoopSync: hiç durmaz
  } catch (hata) {
    root.wip = null
    root.wipKok = null
    throw hata
  }
  commitRoot(root)
}

function prepareFreshStack(root) {
  root.isVar = false // şu ana kadarki tüm güncellemeleri bu render işleyecek
  root.yenidenBasla = false
  const element = root.bekleyenEleman !== undefined ? root.bekleyenEleman : root.current.memoizedProps.element
  root.islenenEleman = element
  root.wipKok = createWorkInProgress(root.current, { element })
  root.wip = root.wipKok
  root.renderEdilenBilesenler = []
}

// ---------------------------------------------------------------- render aşaması (saf, kesilebilir)

function performUnitOfWork(root, birim) {
  root.istatistik.birim++
  const sonraki = beginWork(root, birim.alternate, birim)
  birim.memoizedProps = birim.pendingProps
  if (sonraki !== null) root.wip = sonraki
  else completeUnitOfWork(root, birim)
}

/** Aşağı inerken: bileşeni çalıştır, çocuk elemanları fiber'larla uzlaştır, ilk çocuğu döndür. */
function beginWork(root, current, wip) {
  switch (wip.tag) {
    case HostRoot:
      return reconcileChildren(current, wip, normalizeChildren([wip.pendingProps.element]))
    case HostComponent:
      return reconcileChildren(current, wip, wip.pendingProps.children)
    case HostText:
      return null
    case FunctionComponent: {
      root.hooks?.renderOncesi?.(root, current, wip)
      let cikti
      try {
        cikti = wip.type(wip.pendingProps)
      } finally {
        root.hooks?.renderSonrasi?.(root, current, wip)
      }
      return reconcileChildren(current, wip, normalizeChildren([cikti]))
    }
    default:
      throw new Error(`bilinmeyen fiber etiketi ${wip.tag}`)
  }
}

function reconcileChildren(current, wip, elemanlar) {
  // current yoksa (ilk montaj) yan etki izlenmez: ebeveyn zaten yeni, çocuklar onunla birlikte eklenecek.
  wip.child = reconcileChildFibers(wip, current !== null ? current.child : null, elemanlar, current !== null)
  return wip.child
}

const slotKey = (key, i) => (key != null ? `k:${key}` : `i:${i}`)

// ReactChildFiber.js'in özü. Gerçek kod önce sırayla eşleşen kısmı hızlı geçer, sonra Map'e düşer;
// mini doğrudan Map kullanır (sonuç aynı, hızlı yol yok).
function reconcileChildFibers(returnFiber, ilkEski, elemanlar, izle) {
  const eskiler = new Map()
  for (let f = ilkEski; f !== null; f = f.sibling) eskiler.set(slotKey(f.key, f.index), f)

  let ilk = null
  let onceki = null
  let lastPlacedIndex = 0
  elemanlar.forEach((el, i) => {
    const k = slotKey(el.key, i)
    const eski = eskiler.get(k)
    let yeni
    if (eski !== undefined && eski.type === el.type) {
      eskiler.delete(k)
      yeni = createWorkInProgress(eski, el.props)
    } else {
      yeni = createFiberFromElement(el) // tür değişti ya da yeni: eski (varsa) aşağıda silinir
    }
    yeni.index = i
    yeni.return = returnFiber
    lastPlacedIndex = placeChild(yeni, lastPlacedIndex, izle)
    if (onceki === null) ilk = yeni
    else onceki.sibling = yeni
    onceki = yeni
  })
  if (izle) for (const artik of eskiler.values()) deleteChild(returnFiber, artik)
  return ilk
}

function placeChild(fiber, lastPlacedIndex, izle) {
  if (!izle) return lastPlacedIndex
  const current = fiber.alternate
  if (current !== null) {
    if (current.index < lastPlacedIndex) {
      fiber.flags |= Placement // taşıma
      return lastPlacedIndex
    }
    return current.index // yerinde kalabilir
  }
  fiber.flags |= Placement // yeni ekleme
  return lastPlacedIndex
}

function deleteChild(returnFiber, cocuk) {
  if (returnFiber.deletions === null) returnFiber.deletions = []
  returnFiber.deletions.push(cocuk)
  returnFiber.flags |= ChildDeletion
}

/** Yukarı çıkarken: host düğümlerini ekran dışında hazırla, kardeşe geç ya da ebeveyne dön. */
function completeUnitOfWork(root, birim) {
  let node = birim
  while (node !== null) {
    completeWork(root, node)
    bubbleProperties(node)
    if (node.sibling !== null) {
      root.wip = node.sibling
      return
    }
    node = node.return
  }
  root.wip = null // köke ulaşıldı: render aşaması bitti
}

function completeWork(root, wip) {
  const current = wip.alternate
  if (wip.tag === HostComponent) {
    if (current !== null && wip.stateNode !== null) {
      if (!shallowEqualProps(current.memoizedProps, wip.pendingProps)) wip.flags |= Update
    } else {
      const instance = root.host.createInstance(wip.type, wip.pendingProps)
      appendAllChildren(root.host, instance, wip)
      wip.stateNode = instance
    }
  } else if (wip.tag === HostText) {
    if (current !== null && wip.stateNode !== null) {
      if (current.memoizedProps.nodeValue !== wip.pendingProps.nodeValue) wip.flags |= Update
    } else {
      wip.stateNode = root.host.createTextInstance(wip.pendingProps.nodeValue)
    }
  } else if (wip.tag === FunctionComponent) {
    root.renderEdilenBilesenler.push(wip)
  }
}

/** Yeni host düğümünün altına, alt ağaçtaki en üst düzey host çocuklarını ekler (bileşenlerin içine iner). */
function appendAllChildren(host, parent, wip) {
  let node = wip.child
  while (node !== null) {
    if (node.tag === HostComponent || node.tag === HostText) {
      host.appendInitialChild(parent, node.stateNode)
    } else if (node.child !== null) {
      node = node.child
      continue
    }
    while (node.sibling === null) {
      if (node.return === null || node.return === wip) return
      node = node.return
    }
    node = node.sibling
  }
}

/** Alt ağaçta yan etki var mı? Commit, temiz dalları hiç gezmeden atlar. */
function bubbleProperties(fiber) {
  let bayrak = NoFlags
  for (let c = fiber.child; c !== null; c = c.sibling) bayrak |= c.flags | c.subtreeFlags
  fiber.subtreeFlags = bayrak
}

// ---------------------------------------------------------------- commit aşaması (senkron, kesilmez)

function commitRoot(root) {
  const bitmis = root.wipKok
  root.wipKok = null
  commitMutationEffects(root, bitmis) // 1) silme, yerleştirme, güncelleme
  root.current = bitmis // 2) ağaç değişimi: artık ekrandaki ağaç bu
  if (root.bekleyenEleman === root.islenenEleman) root.bekleyenEleman = undefined
  root.hooks?.commitSonrasi?.(root, root.renderEdilenBilesenler) // 3) hook kuyrukları, pasif efektler
  kopar(bitmis) // mini'ye özgü: eski ağaçla bağları kopar ki çöp toplanabilsin
  root.istatistik.commit++
}

function commitMutationEffects(root, fiber) {
  if (fiber.deletions !== null) for (const silinecek of fiber.deletions) commitDeletion(root, fiber, silinecek)
  if (fiber.subtreeFlags !== NoFlags) {
    for (let c = fiber.child; c !== null; c = c.sibling) commitMutationEffects(root, c)
  }
  if (fiber.flags & Placement) commitPlacement(root, fiber)
  if (fiber.flags & Update) commitUpdate(root, fiber)
}

function hostParentOf(root, fiber) {
  for (let p = fiber; p !== null; p = p.return) {
    if (p.tag === HostComponent) return { node: p.stateNode, kapsayici: false }
    if (p.tag === HostRoot) return { node: root.containerInfo, kapsayici: true }
  }
  throw new Error('host ebeveyni bulunamadı')
}

const isHost = (f) => f.tag === HostComponent || f.tag === HostText
const isHostParent = (f) => f.tag === HostComponent || f.tag === HostRoot

function commitPlacement(root, fiber) {
  const { node, kapsayici } = hostParentOf(root, fiber.return)
  insertOrAppend(root.host, fiber, getHostSibling(fiber), node, kapsayici)
}

function insertOrAppend(host, fiber, once, parent, kapsayici) {
  if (isHost(fiber)) {
    if (once !== null) {
      if (kapsayici) host.insertInContainerBefore(parent, fiber.stateNode, once)
      else host.insertBefore(parent, fiber.stateNode, once)
    } else if (kapsayici) host.appendChildToContainer(parent, fiber.stateNode)
    else host.appendChild(parent, fiber.stateNode)
    return
  }
  for (let c = fiber.child; c !== null; c = c.sibling) insertOrAppend(host, c, once, parent, kapsayici)
}

/** Yerleşecek düğümün önüne konacağı, yerinde duran ilk host kardeşi bulur (bileşenlerin içine iner). */
function getHostSibling(fiber) {
  let node = fiber
  kardesler: while (true) {
    while (node.sibling === null) {
      if (node.return === null || isHostParent(node.return)) return null
      node = node.return
    }
    node = node.sibling
    while (!isHost(node)) {
      if (node.flags & Placement || node.child === null) continue kardesler // o da yer değiştiriyor ya da boş
      node = node.child
    }
    if (!(node.flags & Placement)) return node.stateNode
  }
}

function commitUpdate(root, fiber) {
  const eski = fiber.alternate.memoizedProps
  if (fiber.tag === HostComponent) root.host.commitUpdate(fiber.stateNode, fiber.type, eski, fiber.memoizedProps)
  else if (fiber.tag === HostText) {
    root.host.commitTextUpdate(fiber.stateNode, eski.nodeValue, fiber.memoizedProps.nodeValue)
  }
}

function commitDeletion(root, parentFiber, silinecek) {
  const { node, kapsayici } = hostParentOf(root, parentFiber)
  for (const hostNode of enUstHostlar(silinecek)) {
    if (kapsayici) root.host.removeChildFromContainer(node, hostNode)
    else root.host.removeChild(node, hostNode)
  }
  // Sökülen alt ağaçtaki bileşenlere haber ver (efekt temizlikleri Aşama 4'te).
  if (root.hooks?.silinenFiber) {
    gez(silinecek, (f) => {
      if (f.tag === FunctionComponent) root.hooks.silinenFiber(root, f)
    })
  }
}

function enUstHostlar(fiber) {
  if (isHost(fiber)) return [fiber.stateNode]
  const out = []
  for (let c = fiber.child; c !== null; c = c.sibling) out.push(...enUstHostlar(c))
  return out
}

function gez(fiber, ziyaret) {
  ziyaret(fiber)
  for (let c = fiber.child; c !== null; c = c.sibling) gez(c, ziyaret)
}

function kopar(fiber) {
  gez(fiber, (f) => {
    f.alternate = null
    f.deletions = null
  })
}
