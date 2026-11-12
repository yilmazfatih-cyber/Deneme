// AŞAMA 4 — Hook'lar: useState, useReducer, useEffect, useRef + toplu güncelleme (batching).
// Hook'un sırrı: durum bileşen fonksiyonunda değil, fiber'da durur. Bileşen her çağrıldığında hook'lar
// aynı sırayla okunur; "kaçıncı hook" bilgisi durumun adresidir. Bu yüzden hook'lar koşullu çağrılamaz.
// Gerçek karşılıklar:
//   packages/react/src/ReactHooks.js          → useState vb. yalnızca resolveDispatcher() üzerinden yönlendirir
//   packages/react-reconciler/src/ReactFiberHooks.js → renderWithHooks, mountState/updateReducerImpl,
//     dispatchSetStateInternal (eager bailout), mountEffect/updateEffect, areHookInputsEqual, basicStateReducer
//   ReactFiberWorkLoop.js → flushPassiveEffects; ReactFiberCommitWork.js → commitPassive(Un)mountEffects
// Mini farkı: hook'lar bağlı liste yerine dizi; güncellemede şerit (lane) yok, her güncelleme kökten render eder.

import { createRoot as createFiberRoot, ensureRootIsScheduled } from './asama3_fiber.js'

// ReactSharedInternals.H karşılığı: şu an hangi bileşenin hook'ları işleniyor?
const surec = { root: null, wip: null, index: 0, hooks: null, oncekiHooks: null }

/** Aşama 3 kökü + hook eklentisi. */
export function createRoot(container, secenekler) {
  return createFiberRoot(container, { ...secenekler, hooks: hookEklentisi })
}

const hookEklentisi = {
  isOncesi(root) {
    flushPassiveEffects(root)
  },
  renderOncesi(root, current, wip) {
    surec.root = root
    surec.wip = wip
    surec.index = 0
    surec.hooks = []
    surec.oncekiHooks = current !== null ? current.memoizedState : null
  },
  renderSonrasi(root, current, wip) {
    const { hooks, oncekiHooks } = surec
    surec.root = surec.wip = surec.hooks = surec.oncekiHooks = null
    wip.memoizedState = hooks
    if (oncekiHooks !== null && oncekiHooks.length !== hooks.length) {
      throw new Error(`Hook sayısı değişti (${oncekiHooks.length} → ${hooks.length}): hook'lar koşullu çağrılamaz.`)
    }
  },
  commitSonrasi(root, bilesenler) {
    root.bekleyenEfektler ??= []
    for (const fiber of bilesenler) {
      for (const hook of fiber.memoizedState) {
        if (hook.tur === 'durum') {
          // Bu render'ın işlediği güncellemeler artık kalıcı: kuyruktan düş.
          hook.kuyruk.bekleyen.splice(0, hook.islenen)
          hook.kuyruk.sonDurum = hook.durum
        } else if (hook.tur === 'efekt' && hook.degisti) {
          root.bekleyenEfektler.push(hook)
        }
      }
    }
    if (root.bekleyenEfektler.length > 0 || root.bekleyenTemizlikler?.length > 0) {
      queueMicrotask(() => flushPassiveEffects(root)) // React: boyamadan sonra (zamanlayıcı görevi)
    }
  },
  silinenFiber(root, fiber) {
    for (const hook of fiber.memoizedState || []) {
      if (hook.tur === 'durum') hook.kuyruk.sokuldu = true
      if (hook.tur === 'efekt' && hook.temizle) (root.bekleyenTemizlikler ??= []).push(hook)
    }
  },
}

function sonrakiHook(tur) {
  if (surec.wip === null) {
    throw new Error('Geçersiz hook çağrısı: hook yalnızca bir bileşen render edilirken çağrılabilir.')
  }
  const i = surec.index++
  const eski = surec.oncekiHooks !== null ? surec.oncekiHooks[i] : undefined
  if (surec.oncekiHooks !== null && eski === undefined) {
    throw new Error('Önceki render’dan daha fazla hook çağrıldı: hook’lar koşullu çağrılamaz.')
  }
  if (eski !== undefined && eski.tur !== tur) {
    throw new Error(`Hook sırası değişti: ${i}. sırada "${eski.tur}" beklenirken "${tur}" çağrıldı.`)
  }
  return eski
}

/** useState = basicStateReducer ile useReducer (ReactFiberHooks.js'te de böyle). */
function basicStateReducer(durum, eylem) {
  return typeof eylem === 'function' ? eylem(durum) : eylem
}

export function useState(ilk) {
  return useReducer(basicStateReducer, ilk, (x) => (typeof x === 'function' ? x() : x))
}

export function useReducer(reducer, ilkArg, init) {
  const eski = sonrakiHook('durum')
  if (eski === undefined) {
    const ilk = init ? init(ilkArg) : ilkArg
    const kuyruk = { bekleyen: [], sonReducer: reducer, sonDurum: ilk, sokuldu: false, dispatch: null }
    kuyruk.dispatch = dispatchAction.bind(null, surec.root, kuyruk)
    surec.hooks.push({ tur: 'durum', durum: ilk, kuyruk, islenen: 0 })
    return [ilk, kuyruk.dispatch]
  }
  // Güncelleme: son commit'teki durumdan başla, bekleyen eylemleri sırayla uygula.
  // Kuyruk burada boşaltılmaz; render çöpe atılırsa (kesinti) eylemler kaybolmasın diye commit'te temizlenir.
  const kuyruk = eski.kuyruk
  kuyruk.sonReducer = reducer
  let durum = eski.durum
  for (const eylem of kuyruk.bekleyen) durum = reducer(durum, eylem)
  surec.hooks.push({ tur: 'durum', durum, kuyruk, islenen: kuyruk.bekleyen.length })
  return [durum, kuyruk.dispatch]
}

function dispatchAction(root, kuyruk, eylem) {
  if (kuyruk.sokuldu) return // sökülmüş bileşen: yok say
  if (kuyruk.bekleyen.length === 0) {
    // Hızlı yol (eager bailout): yeni durum aynıysa render planlamaya gerek yok.
    const yeni = kuyruk.sonReducer(kuyruk.sonDurum, eylem)
    if (Object.is(yeni, kuyruk.sonDurum)) return
  }
  kuyruk.bekleyen.push(eylem)
  ensureRootIsScheduled(root) // aynı tick'teki tüm dispatch'ler tek render'da toplanır
}

/** areHookInputsEqual: bağımlılıklar Object.is ile tek tek karşılaştırılır. */
function ayniBagimliliklar(a, b) {
  if (b == null || a.length !== b.length) return false
  return a.every((x, i) => Object.is(x, b[i]))
}

export function useEffect(olustur, bagimliliklar) {
  const eski = sonrakiHook('efekt')
  const degisti = eski === undefined || bagimliliklar == null || !ayniBagimliliklar(bagimliliklar, eski.bagimliliklar)
  surec.hooks.push({
    tur: 'efekt',
    olustur,
    bagimliliklar,
    degisti,
    temizle: eski !== undefined ? eski.temizle : null,
  })
}

export function useRef(ilk) {
  const eski = sonrakiHook('ref')
  const hook = eski !== undefined ? { tur: 'ref', ref: eski.ref } : { tur: 'ref', ref: { current: ilk } }
  surec.hooks.push(hook)
  return hook.ref
}

/** Pasif efektler: önce TÜM temizlikler (söküm + yeniden çalışacakların eskisi), sonra TÜM yeni efektler. */
function flushPassiveEffects(root) {
  const sokumler = root.bekleyenTemizlikler ?? []
  const efektler = root.bekleyenEfektler ?? []
  if (sokumler.length === 0 && efektler.length === 0) return
  root.bekleyenTemizlikler = []
  root.bekleyenEfektler = []
  for (const hook of [...sokumler, ...efektler]) {
    if (hook.temizle) {
      const temizle = hook.temizle
      hook.temizle = null
      temizle()
    }
  }
  for (const hook of efektler) {
    const sonuc = hook.olustur()
    hook.temizle = typeof sonuc === 'function' ? sonuc : null
  }
}
